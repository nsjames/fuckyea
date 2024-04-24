#! /usr/bin/env node

require('dotenv').config();

const figlet = require("figlet");
const { Command } = require("commander");
const fs = require("fs");
const path = require("path");
const { exec, execSync } = require("child_process");
const Mocha = require('mocha');
const {globSync} = require('glob')
const ApiService = require("./services/api.service");
const IdService = require('./services/id.service');
const axios = require('axios');
const { Session , Chains, Serializer, ABI } = require("@wharfkit/session")
const { WalletPluginPrivateKey } = require("@wharfkit/wallet-plugin-privatekey")
const {TransactPluginResourceProvider} = require('@wharfkit/transact-plugin-resource-provider');
const { Contract } = require("@wharfkit/contract")
const { createHash } = require('crypto');

const sha256 = (data) => {
    return createHash('sha256').update(data).digest('hex')
}

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

        // renaming gitignore
        fs.renameSync(path.join(projectDirectory, 'gitignore'), path.join(projectDirectory, '.gitignore'));

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
            fs.cpSync(path.join(__dirname, "../project-template/deployments/jungle.ts"), path.join(directory, `${name}.ts`));
        } else {
            console.error("Invalid type", type);
        }
    })

const build = async () => {
    console.log("Building contracts");
    const projectFiles = globSync("contracts/**/*.{cpp,c,h,hpp}").map(filepath => {
        const fileinfo = path.parse(filepath);
        const content = fs.readFileSync(filepath).toString();
        let filePath = fileinfo.dir.replace(path.join('contracts'), '').replace(/\\/g,"/");
        if(filePath.startsWith('/')) filePath = filePath.substring(1);
        if(filePath.length && !filePath.endsWith('/')) filePath += '/';
        return {
            name: fileinfo.base,
            path: filePath,
            content,
        }
    })

    const id = IdService.getProjectId();

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

    const buildableFiles = result;
    const buildFolder = path.join(process.cwd(), 'build');
    try { fs.rmSync(buildFolder, {recursive: true}); } catch (e) { }
    fs.mkdirSync(buildFolder);

    await Promise.all(buildableFiles.map(async ({wasm, abi, name}) => {
        const downloadedWasm = await axios.get(wasm, { responseType: 'arraybuffer' }).then(x => x.data).catch((err) => console.log('err', err));
        const downloadedAbi = await axios.get(abi, { responseType: 'arraybuffer' }).then(x => x.data).catch((err) => console.log('err', err));

        fs.writeFileSync(path.join(buildFolder, `${name}.wasm`), downloadedWasm);
        fs.writeFileSync(path.join(buildFolder, `${name}.abi`), downloadedAbi);
    }));
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


        if(!config.networks[network].accounts){
            console.error("Malformed network account for", network);
            return;
        }

        const accounts = config.networks[network].accounts;
        if(!accounts || !accounts.length){
            console.error("No accounts available for", network);
            return;
        }

        const {chain, node_url} = config.networks[network];

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

        const sessions = {};
        for(let i = 0; i < accounts.length; i++){
            let {name, permission, private_key} = accounts[i];

            if(!permission){
                permission = 'active';
            }

            if(!name || !name.length){
                console.error(`No account name specified in network config (index: ${i})`)
                return;
            }

            if(!private_key || !private_key.length){
                console.error(`No private key specified in network config (index: ${i})`)
                return;
            }

            const walletPlugin = new WalletPluginPrivateKey(private_key);
            sessions[name] = new Session({
                actor: name,
                permission: permission || 'active',
                chain: _chain,
                walletPlugin,
            }, {
                transactPlugins: [new TransactPluginResourceProvider()],
            });
        }

        const deploymentFunction = require(path.join(process.cwd(), deployment));


        const tester = {
            accounts,
            sessions,
            deploy: async (accountName, contractPath, options = {}) => {

                const {addCode = false} = options;

                try {
                    const session = sessions[accountName];
                    if(!session){
                        console.error("No session found for", accountName);
                        return false;
                    }

                    const accountExists = await session.client.v1.chain.get_account(accountName).then(x => true).catch(err => false);
                    if(!accountExists){
                        // TODO: Add creation logic later
                        console.error("Account does not exist:", accountName, "and creation is not supported. Please create the account manually and try again.");
                        process.exit(1);
                    }

                    const contractName = contractPath.split('/').pop();
                    const contractPathWithoutName = contractPath.replace(`/${contractName}`, '');
                    const wasm = fs.readFileSync(path.join(contractPathWithoutName, `${contractName}.wasm`));
                    const abi = JSON.parse(fs.readFileSync(path.join(contractPathWithoutName, `${contractName}.abi`)).toString());

                    const estimatedRam = (wasm.byteLength * 10) + JSON.stringify(abi).length;

                    const accountInfo = await session.client.v1.chain.get_account(session.actor)
                        .then(x => JSON.parse(JSON.stringify(x)))
                        .catch(err => {
                        console.error(err);
                        return {
                            ram_quota: 0,
                        };
                    });

                    let previousCodeSize = 0;
                    let previousHashes = [null,null];
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
                        previousHashes = [previousCode.code_hash, previousCode.abi ? sha256(JSON.stringify(previousCode.abi)) : null];
                    }

                    const freeRam = parseInt(accountInfo.ram_quota.toString()) - parseInt(accountInfo.ram_usage.toString());
                    const extraRamRequired = estimatedRam - previousCodeSize;

                    const ramRequired = freeRam > extraRamRequired ? 0 : extraRamRequired - freeRam;

                    const wasmHash = sha256(wasm);
                    const abiHash = sha256(JSON.stringify(abi));

                    let actions = [];
                    if(previousHashes[0] !== wasmHash){
                        actions.push({
                            account: 'eosio',
                            name: 'setcode',
                            authorization: [session.permissionLevel],
                            data: {
                                account: session.actor,
                                vmtype: 0,
                                vmversion: 0,
                                code: wasm,
                            },
                        });
                    }

                    if(previousHashes[1] !== abiHash){
                        actions.push({
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
                        });
                    }

                    if(addCode){
                        if(!accountInfo.permissions){
                            console.error(`No permissions found for ${session.actor}`);
                            return false;
                        }

                        const newActivePermission = accountInfo.permissions.find(x => x.perm_name === 'active').required_auth;
                        if(!newActivePermission){
                            console.error(`No active permission found for ${session.actor}`);
                            return false;
                        }

                        if(!newActivePermission.accounts.find(x => x.permission.actor === session.actor.toString() && x.permission.permission === 'eosio.code')){
                            newActivePermission.accounts.push({
                                permission: {
                                    actor: session.actor,
                                    permission: 'eosio.code',
                                },
                                weight: 1,
                            });

                            actions.push({
                                account: 'eosio',
                                name: 'updateauth',
                                authorization: [session.permissionLevel],
                                data: {
                                    account: session.actor,
                                    permission: 'active',
                                    parent: 'owner',
                                    auth: newActivePermission
                                },
                            });
                        }
                    }

                    if(!actions.length){
                        console.log(`Contract already deployed with same code and abi`)
                        return true;
                    }

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

                    const contractInstance = new Contract({
                        abi,
                        account: session.actor,
                        client: session.client,
                    });

                    return await session.transact({ actions }).then(x => {
                        console.log(`Contract deployed!`)
                        console.log(`Transaction hash: ${x.response.transaction_id}`);

                        return contractInstance;
                    }).catch(err => {
                        if(err.toString().indexOf("contract is already running this version of code") > -1){
                            console.warn(`Contract already deployed with same code`)
                            return contractInstance;
                        }
                        console.error(err);
                        return false;
                    });
                } catch (e) {
                    console.error(`Error deploying`, e);
                }
            },
        }

        await deploymentFunction(tester);
    })

program.command("test")
    .description("Run all tests")
    .option("-b, --build", "Build before running tests")
    .option("-t, --test <test_name>", "Run a specific test")
    .action(async (options) => {
        const hasBuiltContracts = fs.existsSync(path.join(process.cwd(), 'build')) && globSync("build/*.wasm").length > 0;
        if(options.build || !hasBuiltContracts){
            await build();
        }

        const mocha = new Mocha({
            timeout: 10000,
            color: true,
        });

        let glob = "tests/**/*.spec.{ts,js}";
        if(options.test){
            glob = options.test;
        }

        const files = globSync(glob);

        files.forEach(file => {
            mocha.addFile(file);
        });

        await mocha.run();
    })

program.command("starter <project_name> <path_to_clone_to>")
    .description("Start a new project from a starter kit")
    .action(async (project_name, path_to_clone_to) => {
        console.log(`Starting a new project from ${project_name} as ${path_to_clone_to}`);

        if(fs.existsSync(path_to_clone_to)){
            console.error(`Folder already exists at ${path_to_clone_to}`);
            return;
        }

        const executeCommandOrExit = (command, cwd = process.cwd()) => {
            try {
                return execSync(command, {cwd}).toString();
            } catch (e) {
                console.error(e);
                process.exit(1);
            }
        }

        executeCommandOrExit('git --version');
        executeCommandOrExit(`rm -rf ${path_to_clone_to}`);
        executeCommandOrExit(`git clone --no-checkout https://github.com/eosnetworkfoundation/template-projects.git ${path_to_clone_to}`);
        executeCommandOrExit(`git sparse-checkout init --cone`, path_to_clone_to);
        executeCommandOrExit(`git sparse-checkout set ${project_name}`, path_to_clone_to);
        executeCommandOrExit(`git checkout`, path_to_clone_to);

        for(let file of fs.readdirSync(path_to_clone_to)){
            if(file !== project_name){
                fs.rmSync(path.join(path_to_clone_to, file), {recursive: true});
            }
        }

        const filesToMove = fs.readdirSync(path.join(path_to_clone_to, project_name));
        filesToMove.forEach(file => {
            fs.renameSync(path.join(path_to_clone_to, project_name, file), path.join(path_to_clone_to, file));
        });

        fs.rmdirSync(path.join(path_to_clone_to, project_name));

        console.log(`Finished setting up your project.`)
        console.log(`Go into your new project folder and read the README to get started.`)
    })

program.parse(process.argv);

const main = () => {
    const options = program.opts();
}

main();
