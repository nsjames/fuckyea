const { Blockchain, nameToBigInt } = require("@eosnetwork/vert");
const { assert } = require("chai");
const blockchain = new Blockchain()

// Load contract (use paths relative to the root of the project)
const contract = blockchain.createContract('contract', 'build/contract')

/* Runs before each test */
beforeEach(async () => {
    blockchain.resetTables()
})

/* Tests */
describe('Test', () => {
    it('testing', async () => {
        const [usera, userb] = blockchain.createAccounts('usera', 'userb')
        const result = await contract.actions.newuser(['usera']).send('usera@active')
        const rows = contract.tables.users(nameToBigInt('contract')).getTableRow(nameToBigInt('usera'));
        assert(!!rows, "User not found")
    });
});
