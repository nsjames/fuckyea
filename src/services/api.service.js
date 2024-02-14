const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const API_URL = 'https://api.ide.eosnetwork.com';
const WS_URL = "wss://api.ide.eosnetwork.com/websocket";
// const API_URL = 'http://192.168.46.177:3001';
// const WS_URL = "ws://192.168.46.177:3001";


let socket;

let lastZip = null;
let lastWasm = null;
let lastAbi = null;

let buildResolver = null;

module.exports = class ApiService {

    static setup(){
        if(socket) {
            socket.close();
            socket = null;
        }
        return new Promise((resolve, reject) => {
            socket = new WebSocket(WS_URL);

            socket.addEventListener('open', () => {
                resolve(true);
            });

            socket.addEventListener('message', (event) => {

                let json;
                try {
                    json = JSON.parse(event.data);
                } catch (error) {
                    return console.error('Error parsing message:', error);
                }

                if(json.type === "build-status"){

                    if(json.data.success){
                        if(buildResolver){

                            const allFiles = fs.readdirSync(path.join(process.cwd(), 'contracts'));
                            const hasEntryContracts = allFiles.filter((x) => x.endsWith(".entry.cpp")).length > 0;

                            const buildableFiles = (() => {
                                if(hasEntryContracts) return allFiles.filter((x) => x.endsWith(".entry.cpp"));
                                return allFiles.filter((x) => x.endsWith(".cpp"));
                            })().map(x => {
                                const contractName = x.replace('.entry.cpp', '').replace('.cpp', '');
                                return {
                                    name: contractName,
                                    wasm: `${API_URL}/v1/download/wasm/${json.data.data}/${contractName}`,
                                    abi: `${API_URL}/v1/download/abi/${json.data.data}/${contractName}`
                                }
                            })



                            buildResolver(buildableFiles);
                            buildResolver = null;
                        }
                    } else {
                        if(buildResolver){
                            console.error(`There was an error building the contract`)
                            console.log('-------------------------------------------------')
                            console.error(json.data.data);
                            console.log('-------------------------------------------------')
                            buildResolver(null);
                            buildResolver = null;
                        }
                    }

                    socket.close();

                    return;
                }


                if(json.type === "saved"){
                    if(buildResolver){
                        buildResolver(json);
                        buildResolver = null;
                    }
                    return;
                }
            });

            socket.addEventListener('close', () => {
                // console.log('WebSocket connection closed');
                reject(false);
            });

            socket.addEventListener('error', (error) => {
                console.error('WebSocket error:', error);
                reject(error);
            });
        });
    }

    static async build(project){
        await ApiService.save(project);

        let promise = null;
        promise = new Promise(r => {
            buildResolver = r;
        })

        ApiService.sendMessage('build', {id: project.id});

        return promise;
    }

    static save(project){
        let promise = null;
        promise = new Promise(r => {
            buildResolver = r;
        })

        ApiService.sendMessage('save', project);
        return promise;
    }

    static sendMessage(type, data){
        socket.send(JSON.stringify({type, data}));
    }

}
