/* tslint:disable */

const { compileParcel } = require('./parcel-build')

module.exports = async () => {
  await Promise.all([compileParcel()])
}
