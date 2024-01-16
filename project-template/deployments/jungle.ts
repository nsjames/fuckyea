module.exports = async (tester) => {

    // the returned value will be:
    /*
    {
        accounts: [same as your config accounts],
        sessions: {[accountName]: wharfkit session object},
        deploy => (accountName, contractPath): wharfkit contract instance,
    }
     */
    const contract = await tester.deploy('youraccount', 'build/contract').catch(err => {
        console.error(err)
        process.exit(1);
    })

    // do other stuff here...
}
