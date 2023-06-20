const fs       = require('fs')
const zlib     = require('zlib')
const readline = require('readline')
const axios    = require('axios')

// Helper to find relevant attributes
const getAttr = (obj, attr) => {
  let value = obj.find(el => el.name === attr)
  if (value) return value.value
  return ''
}

// Attributes to extract from organizations
let attrs = ['organisation', 'org-name', 'org-type', 'address', 'phone', 'e-mail', 'language', 'admin-c', 'tech-c', 'created', 'last-modified', 'person']

// Attributes to extract from admin information
let pers = ['person', 'phone', 'fax-no', 'e-mail', 'phone']

const orgs = []

const start = async () => {

  // Create readable stream 
  let stream = readline.createInterface({
    input: fs.createReadStream('ripe.db.gz').pipe(zlib.createGunzip())
  })

  // Read stream line by line
  for await (let s of stream) {
    // Read line from buffer to string
    let str = s.toString()

    // Check if the line includes an organization
    if (!str.match(/ORG-/)) continue
    let org = str.match(/ORG-[^\n\s]+/)[0]

    // Check if the organization was already parsed
    if (orgs.includes(org)) continue
    orgs.push(org)

    // Notify user about the org
    console.log(org)

    // Get the data
    const req = await axios(`https://apps.db.ripe.net/db-web-ui/api/whois/ripe/organisation/${org}?abuse-contact=true&managed-attributes=true&resource-holder=true&unfiltered=true`).catch(err => { return false })
    if (!req) continue

    // If no data then skip
    let obj = req?.data?.objects?.object
    if (!obj) continue

    obj = obj[0]
    let link = obj.link.href
    let { attributes } = obj

    // Define the final object
    let result = {}
    for (let attr of attrs) {
      result[attr] = getAttr(attributes.attribute, attr)
    }
    result.link = link

    await new Promise(resolve => setTimeout(resolve, 1000))

    // Get info about admin-c
    let adm = {}
    let adminC = attributes.attribute.find(el=> el.name === 'admin-c' && el['referenced-type'] === 'person')
    for (let attr of pers) {
      adm[attr] = getAttr([], attr)
    }

    if (adminC) {
      console.log(adminC.value)
      let adminData = await axios(`https://apps.db.ripe.net/db-web-ui/api/whois/ripe/person/${adminC.value}?abuse-contact=true&managed-attributes=true&resource-holder=true&unfiltered=true`).catch(err => { return false })
      if (adminData) {
        let admin = adminData?.data?.objects?.object
        if (admin) {
          admin = admin[0]
          let result = {}
          for (let attr of pers) {
            adm[attr] = getAttr(admin.attributes.attribute, attr)
          }
        }
      }
    }

    // Append data to file
    fs.appendFileSync('./result.tsv', Object.values(result).join('\t') + '\t' + Object.values(adm).join('\t') + '\n')

    // Wait for one second
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}

start()