const WebSocket = require('ws');
const API_URL = 'https://api.ide.eosnetwork.com';
const WS_URL = "wss://api.ide.eosnetwork.com/websocket";


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
                            const wasm = `${API_URL}/v1/download/wasm/${json.data.data}`;
                            const abi = `${API_URL}/v1/download/abi/${json.data.data}`;

                            buildResolver({wasm, abi});
                            buildResolver = null;
                        }
                    } else {
                        if(buildResolver){
                            console.error(json.data);
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
