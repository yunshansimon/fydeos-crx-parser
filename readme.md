## Crx Parser Introduction

The file with suffix ".crx" is chrome's extension/webApp package.
_Crx Paser_ used to parse the package, get the informat about
app's name, app's id and icon.

## Usage

#### crxParser.parse(path [,option], callback)

* **path** `<string>` the crx file path
* **option** `<object>`
  * **iconPath** `<string>` set the path to extract the app's icons. support `$APPID` be replaced by app's id.
  * **locales** `<array>` locale's i18n names. like 'en', 'zh-CN'. if there are any place holder like `__MSG_stringname__` in app's manifest, the parser will extract locales file from packages, and replace the string by the locale file. <br>
  the property will be returned as:

```javascript
{
  value: locales[0].stringname.message
  _locales:{
    locales[0]:locales[0].stringname.message,
    ...
  }
}
```

  * **callback** `<function>` function (err, crxInfo){} if there is no error, `err` will be null. crxInfo is a object:

```javascript
{
  version: Number , // 2 or 3 .
  header:{
    id: String //app id
    crx_id: String //crx id for version:3
    PublicKey: Buffer // public key for version:2
    signature: Buffer // signature for version:2
    sha256_with_rsa: [{
      PublicKey: Buffer,
      signature: Buffer
    }] // asymmetric keys for version:3
    sha256_with_ecdsa: [] // same as above
  },
  manifest: { //App's manifest object.
    name: String // or locale object : App/extension name
  },
  icons: { //the icons have been extracted.
    ["128"]: String // the full path of the saved icon.
    ...
  }
}

```

#### Exemple

```javascript
const crxParser = require('flintos-crx-paser');
...
crxParser(__dirname + `/${file.path}`,{
      iconPath: tmpPath + '/$APPID',
      locales:['zh-CN','en','fi']
    } ,(err,crxInfo)=>{
      should.not.exist(err);
      should.exist(crxInfo);
      crxInfo.should.has.property('header')
      crxInfo.should.has.property('version');
      crxInfo.version.should.eql(file.version);
      crxInfo.header.should.has.property('id');
      crxInfo.should.has.property('icons');
      for(icon in crxInfo.icons){
        fs.statSync(crxInfo.icons[icon]).isFile().should.be.true;
      crxInfo.should.has.property('manifest')
      crxInfo.manifest.should.has.property('name');
      crxInfo.manifest.name.should.be.Object();
      crxInfo.manifest.name.value.should.eql('口袋妖怪大全');
      crxInfo.manifest.name.should.has.property('_locales');
      crxInfo.manifest.name._locales.should.has.properties(['zh-CN','en','fi']);
      })
```