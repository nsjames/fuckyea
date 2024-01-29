// the `tester` injected parameter is an object with the following properties & methods:
/*
{
    accounts: [same as your config accounts],
    sessions: {[accountName]: wharfkit session object},
    deploy => (accountName, contractPath): wharfkit contract instance,
}
 */

module.exports = async (tester) => {

    const contract = await tester.deploy('youraccount', 'build/contract', {
        // adds the `eosio.code` permission to the contract account's active permission
        // so that you can send inline actions from the contract in its name
        addCode: true
    }).catch(err => {
        console.error(err)
        process.exit(1);
    })

    // do other stuff here...
}
