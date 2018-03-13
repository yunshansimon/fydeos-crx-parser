const debug = require('debug')('test'),
  fs = require('fs'),
  should = require('should'),
  { exec } = require('child_process'),
  crxParser = require('..')

function getPrefix(str){
  return str.split('.')[0];
}

describe('crxParser test', function(){
  var tmpPath='/tmp';
  var testFiles = [
    {
      path:"mfabfdnimhipcapcioneheloaehhoggk.crx",
      id: "mfabfdnimhipcapcioneheloaehhoggk",
      version: 2,
      timeout: 1000
    },
    {
      path:"kcdnoglonapgfllkihkgageoililgckl.crx",
      id:"kcdnoglonapgfllkihkgageoililgckl",
      timeout: 3000,
      version: 3
    }
  ];

  after(()=>{
    testFiles.forEach(file=>{
      let path = tmpPath + '/' +file.id
      try{
        fs.accessSync(path)
        exec("rm -rf "+ path);
      }catch(e){}
    })
  })

  testFiles.forEach(file=>it(`crx version:${file.version} id parse`, function(done){
    this.timeout(file.timeout);
    crxParser(__dirname + `/${file.path}`, (err, crxInfo)=>{
      should.not.exist(err);
      should.exist(crxInfo);
      crxInfo.should.has.property('header')
      crxInfo.should.has.property('version');
      crxInfo.version.should.eql(file.version);
      crxInfo.header.should.has.property('id');
      crxInfo.header.id.should.eql(file.id);
      done();
    })
  }))

  testFiles.forEach(file=>it("extract icons version:"+file.version, function(done){
    crxParser(__dirname + `/${file.path}`,{
      iconPath: tmpPath + '/$APPID'
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
      }
      done();
    });
  }))

  it("locales support version:3", function(done){
    crxParser(__dirname + `/${testFiles[1].path}`,{
      locales:['zh-CN','en','fi']
    },(err, crxInfo)=>{
      should.not.exist(err);
      should.exist(crxInfo);
      crxInfo.should.has.property('manifest')
      crxInfo.manifest.should.has.property('name');
      crxInfo.manifest.name.should.be.Object();
      crxInfo.manifest.name.value.should.eql('口袋妖怪大全');
      crxInfo.manifest.name.should.has.property('_locales');
      crxInfo.manifest.name._locales.should.has.properties(['zh-CN','en','fi']);
      done();
    })
  })
})


