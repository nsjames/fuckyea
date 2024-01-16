#! /usr/bin/env node

require('dotenv').config();

const figlet = require("figlet");
const { Command } = require("commander");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const Mocha = require('mocha');
const {globSync} = require('glob')
const ApiService = require("./services/api.service");
const axios = require('axios');
const { Session , Chains, Serializer, ABI } = require("@wharfkit/session")
const { WalletPluginPrivateKey } = require("@wharfkit/wallet-plugin-privatekey")

const program = new Command();

console.log(figlet.textSync("FUCK YEA"));

program
    .version("1.0.0")
    .description("A command line interface for working with Antelope Smart Contracts")
    .action(() => {

    })

program.command("create <project_name> [optional_directory]")
    .description("Create a new project")
    .action((project_name, optional_directory) => {
        console.log("Creating new project", project_name, optional_directory);

        const filesToCopy = fs.readdirSync(path.join(__dirname, "../project-template"));

        const projectDirectory = optional_directory || project_name;

        if(!fs.existsSync(projectDirectory)){
            fs.mkdirSync(projectDirectory);
        }

        fs.cpSync(path.join(__dirname, "../project-template"), projectDirectory, {recursive: true});

        fs.writeFileSync(path.join(projectDirectory, ".env"), "PRIVATE_KEY=");

        console.log(`Finished setting up your project.`)
        console.log(`Go into your project folder and use your package manager to install the dependencies.`)
        console.log(`For example:`)
        console.log(`cd ${projectDirectory}`)
        console.log(`npm install`);
    })

program.command("scaffold <type(contract|test|deployment)> <name|network> [optional_directory]")
    .description("Scaffold a new contract, test, or deployment")
    .action((type, name, optional_directory) => {
        console.log("Scaffolding a new", type);
        if(!name || !name.length){
            console.error("Invalid name:", name);
            return;
        }

        const directory = optional_directory || "";

        if(directory && directory.length && !fs.existsSync(directory)){
            fs.mkdirSync(directory);
        }

        if(type === "contract"){
            fs.cpSync(path.join(__dirname, "../project-template/contracts/contract.cpp"), path.join(directory, `${name}.cpp`));
        } else if(type === "test"){
            fs.cpSync(path.join(__dirname, "../project-template/tests/contract.spec.ts"), path.join(directory, `${name}.spec.ts`));
        } else if(type === "deployment"){
            fs.cpSync(path.join(__dirname, "../project-template/deployments/eos.ts"), path.join(directory, `${name}.ts`));
        } else {
            console.error("Invalid type", type);
        }
    })

const build = async () => {
    console.log("Building contracts");
    const projectFiles = globSync("contracts/**/*.{cpp,c,h,hpp}").map(filepath => {
        const fileinfo = path.parse(filepath);
        const content = fs.readFileSync(filepath).toString();
        return {
            name: fileinfo.base,
            path: fileinfo.dir.replace(path.join('contracts'), '').replace(/^\//, '').replace(/^\\/, ''),
            content,
        }
    })

    const id = 'contract-12345678-1234-1234-12345678';

    const projectNameFromPackageJson = JSON.parse(fs.readFileSync('package.json').toString()).name;
    const project = {
        id,
        name:projectNameFromPackageJson,
        files: projectFiles,
        selectedFile: "",
        openFiles: [],
        createdAt: Date.now(),
    };

    await ApiService.setup();
    const result = await ApiService.build(project);

    if(!result){
        console.error('Build failed');
        return;
    }

    const {wasm, abi} = result;
    const buildFolder = path.join(process.cwd(), 'build');
    try { fs.rmSync(buildFolder, {recursive: true}); } catch (e) { }
    fs.mkdirSync(buildFolder);

    const downloadedWasm = await axios.get(wasm, { responseType: 'arraybuffer' }).then(x => x.data).catch((err) => console.log('err', err));
    const downloadedAbi = await axios.get(abi, { responseType: 'arraybuffer' }).then(x => x.data).catch((err) => console.log('err', err));

    fs.writeFileSync(path.join(buildFolder, 'contract.wasm'), downloadedWasm);
    fs.writeFileSync(path.join(buildFolder, 'contract.abi'), downloadedAbi);
}

program.command("build")
    .description("Builds all contracts")
    .action(async () => {
        await build();
    })

program.command("deploy <network>")
    .description("Deploy all contracts")
    .option("-b, --build", "Build before running tests")
    .action(async (network, options) => {
        console.log("Deploying contracts");

        const hasBuiltContracts = fs.existsSync(path.join(process.cwd(), 'build')) && globSync("build/*.wasm").length > 0;
        if(options.build || !hasBuiltContracts){
            await build();
        }

        network = network.trim();
        if(!network){
            console.error("Must specify a network");
            return;
        }

        const deployment = globSync("deployments/**/*.ts").find(x => x.includes(network));
        if(!deployment){
            console.error("No deployment found for", network);
            return;
        }

        const configPath = path.join(process.cwd(), 'fuckyea.config.js');
        if(!fs.existsSync(configPath)){
            console.error("No config file found");
            return;
        }

        const config = require(configPath);
        if(!config.networks[network]){
            console.error("No network found in config matching", network);
            return;
        }


        if(!config.networks[network].account){
            console.error("Malformed network account for", network);
            return;
        }

        const {name: accountName, permission, private_key} = config.networks[network].account;
        const {chain, node_url} = config.networks[network];

        if(!private_key || !private_key.length){
            console.error("No private key specified in network config")
            return;
        }


        let _chain = chain ? Chains[chain] : null;
        if(!_chain){
            const chain_id = await axios.get(`${node_url}/v1/chain/get_info`).then(x => x.data.chain_id).catch(err => {
                return null;
            })
            if(!chain_id){
                console.error(`Could not fetch chain id from: ${node_url}`);
                return;
            }

            _chain = {
                id: chain_id,
                url: node_url,
            }
        }


        const walletPlugin = new WalletPluginPrivateKey(private_key);
        const session = new Session({
            actor: accountName,
            permission: permission || 'active',
            chain: _chain,
            walletPlugin,
        })

        try {
            const deploymentFunction = require(path.join(process.cwd(), deployment));
            deploymentFunction(async (contractPath) => {
                // check if account exists
                const accountExists = await session.client.v1.chain.get_account(accountName).then(x => true).catch(err => false);
                if(!accountExists){
                    // TODO: Add creation logic later
                    console.error("Account does not exist:", accountName, "and creation is not supported. Please create the account manually and try again.");
                    process.exit(1);
                }

                const contractName = contractPath.split('/').pop();
                const contractPathWithoutName = contractPath.replace(`/${contractName}`, '');
                const wasm = fs.readFileSync(path.join(contractPathWithoutName, `${contractName}.wasm`));
                const abi = fs.readFileSync(path.join(contractPathWithoutName, `${contractName}.abi`));

                const estimatedRam = (wasm.byteLength * 10) + JSON.stringify(abi).length;

                const accountInfo = await session.client.v1.chain.get_account(session.actor).catch(err => {
                    console.error(err);
                    return {
                        ram_quota: 0,
                    };
                });

                let previousCodeSize = 0;
                if(accountInfo.last_code_update.toString() !== '1970-01-01T00:00:00.000'){
                    const previousCode = await axios.post(`${session.chain.url}/v1/chain/get_code`, {
                        account_name: session.actor.toString(),
                        code_as_wasm: true,
                    }).then(x => x.data).catch(err => {
                        console.error(err);
                        return {
                            code_hash: '',
                            wasm: '',
                            abi: {},
                        };
                    });
                    previousCodeSize = (previousCode.wasm.length * 10) + JSON.stringify(previousCode.abi || "").length;
                }

                const freeRam = parseInt(accountInfo.ram_quota.toString()) - parseInt(accountInfo.ram_usage.toString());
                const extraRamRequired = estimatedRam - previousCodeSize;

                const ramRequired = freeRam > extraRamRequired ? 0 : extraRamRequired - freeRam;

                let actions = [{
                    account: 'eosio',
                    name: 'setcode',
                    authorization: [session.permissionLevel],
                    data: {
                        account: session.actor,
                        vmtype: 0,
                        vmversion: 0,
                        code: wasm,
                    },
                },{
                    account: 'eosio',
                    name: 'setabi',
                    authorization: [session.permissionLevel],
                    data: {
                        account: session.actor,
                        abi: Serializer.encode({
                            object: abi,
                            type: ABI
                        }),
                    },
                }];

                if(ramRequired > 0){
                    actions.unshift({
                        account: 'eosio',
                        name: 'buyrambytes',
                        authorization: [session.permissionLevel],
                        data: {
                            // @ts-ignore
                            payer: session.actor,
                            receiver: session.actor,
                            bytes: ramRequired,
                        },
                    });
                }

                return await session.transact({ actions }).then(x => {
                    console.log(`Contract deployed!`)
                    console.log(`Transaction hash: ${x.response.transaction_id}`);
                    return true;
                }).catch(err => {
                    if(err.toString().indexOf("contract is already running this version of code") > -1){
                        console.warn(`Contract already deployed with same code`)
                        return true;
                    }
                    console.error(err);
                    return false;
                });
            });
        } catch(e){
            console.error("Error deploying", e);
        }

    })

program.command("test")
    .description("Run all tests")
    .option("-b, --build", "Build before running tests")
    .action(async (options) => {
        const hasBuiltContracts = fs.existsSync(path.join(process.cwd(), 'build')) && globSync("build/*.wasm").length > 0;
        if(options.build || !hasBuiltContracts){
            await build();
        }

        const mocha = new Mocha({
            timeout: 10000,
            color: true,
        });

        const files = globSync("tests/**/*.spec.{ts,js}");

        files.forEach(file => {
            mocha.addFile(file);
        });

        await mocha.run();
    })


program.parse(process.argv);

const main = () => {
    const options = program.opts();
}

main();
