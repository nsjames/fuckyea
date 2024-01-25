// the `tester` injected parameter is an object with the following properties & methods:
/*
{
    accounts: [same as your config accounts],
    sessions: {[accountName]: wharfkit session object},
    deploy => (accountName, contractPath): wharfkit contract instance,
}
 */

module.exports = async (tester) => {

    const contract = await tester.deploy('youraccount', 'build/contract').catch(err => {
        console.error(err)
        process.exit(1);
    })

    // do other stuff here...
}
