module.exports = {
    networks:{
        jungle: {
            // node_url: 'https://vaulta.greymass.com',
            chain: 'Jungle4',
            accounts: [
                {
                    name: 'youraccount',
                    // permission: 'owner', // defaults to active
                    private_key: process.env.PRIVATE_KEY
                }
            ]
        }
    },
}
