module.exports = async (tester) => {

    // the returned value will be a wharfkit contract object
    const contract = await tester.deploy('youraccount', 'build/contract').catch(err => {
        console.error(err)
        process.exit(1);
    })

    // do other stuff here...
}
