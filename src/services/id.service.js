const fs = require('fs');
const path = require('path');

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomDigits(length) {
    let result = '';
    for (let i = 0; i < length; i++) {
        result += getRandomInt(0, 9).toString();
    }
    return result;
}
function generateId() {
    return `contract-${getRandomDigits(8)}-${getRandomDigits(4)}-${getRandomDigits(4)}-${getRandomDigits(8)}`;
}

module.exports = class IdService {
    static getProjectId() {
        const idPath = path.join(process.cwd(), '.fuckyea_id');
        const existingId = fs.existsSync(idPath);
        let id;

        if(!existingId){
            id = generateId();
            fs.writeFileSync(idPath, id)
        } else {
            id = fs.readFileSync(idPath, {encoding:'utf8'});
        }

        return id;
    }

}
