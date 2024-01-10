module.exports = async (deploy) => {
    // the returned value will be a wharfkit contract object
    const contract = await deploy('build/contract').catch(err => {
        console.error(err)
        process.exit(1);
    })

    // do other stuff here...
}
