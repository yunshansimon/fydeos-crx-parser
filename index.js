const env = require('./lib/env'),
  fs = require('fs'),
  BufferReader = require('./lib/buffer-reader'),
  {calculateId} = require('./lib/util'),
  unzip = require('unzip'),
  debug = require('debug')('crx-parser'),
  concat = require('concat-stream'),
  shell = require('shelljs'),
  combine = require('combine-streams');

const APPID="$APPID",
  I18nTagReg = /__MSG_(\w+)__/,
  LocaleReg =/_locales\/(.*)\/messages\.json/;

function i18nReplace(manifest, locales, default_locale){
  for(let prop in manifest){
    if (typeof manifest[prop] === 'string' &&
        I18nTagReg.test(manifest[prop])){
      let msgProp = I18nTagReg.exec(manifest[prop])[1];
      manifest[prop]={value: msgProp, _locales:{}}
      for (let locale in locales){
        if(locales[locale][msgProp]){
          manifest[prop]._locales[locale] = locales[locale][msgProp].message;
          if (locale == default_locale)
            manifest[prop].value = locales[locale][msgProp].message;
        }
      }
    }
  }
}

module.exports = function(path, opt,callback){
  if(arguments.length ===2){
    callback=opt;
    opt={};
  }
  let waitingFn=null;
  let err = null;
  let rawReader = new BufferReader();
  var crx = {_locales:{},icons:{}};
  let pipeToNext = false;
  let combineStream = combine();
  let locales = opt.locales?
    Array.isArray(opt.locales)? opt.locales:[opt.locales]
    :['en'];
  let iconDir = opt.iconPath? opt.iconPath:null;
  let _locales ={};

  let runningThread = 0;

  function addThread(msg){
    runningThread++;
    debug('+thread:', runningThread, msg);
  }

  function decThread(msg){
    if(--runningThread ==0)
      exit();
    debug('-thread:', runningThread, msg);
  }

  function checkLength(len, cb){
    if (rawReader.length >= rawReader.pos + len)
      return true;
    waitingFn=cb;
    return false;
  }

  function next(){
    if (waitingFn){
      let callFn = waitingFn;
      waitingFn = null;
      callFn();
    }
  }

  function createIconDir(){
    if(iconDir){
      if (crx.header.id) iconDir = iconDir.replace(APPID, crx.header.id);
      try{
        shell.mkdir('-p', iconDir)
      }catch(e){}
    }
  }

  function parseVersion2(){
    if(!checkLength(8, parseVersion2))
      return;
    let publicKeyLength = rawReader.readUInt32LE();
    let signatureLength = rawReader.readUInt32LE();
    if (publicKeyLength > env.MaxPublicKeySize
        || signatureLength > env. MaxSignatureSize)
        return exit(new Error('Exceed max length: publickey or signature'));
    function parseKeys(){
      if(!checkLength(publicKeyLength + signatureLength, parseKeys))
        return;
      crx.header = {
        publicKey: rawReader.readBuffer(publicKeyLength),
        signature: rawReader.readBuffer(signatureLength)
      }
      crx.header.id = calculateId(crx.header.publicKey);
      pipeToUnzip();
    }
    parseKeys();
  }

  function parseAsymmetricKey(type, signBuff){
    debug(type, ':', signBuff.length);
    let signReader = new BufferReader(signBuff);
    if(!crx.header[type]) crx.header[type] =[];
    let sign = {};
    let loop = true
    while( signReader.pos < signReader.length && loop){
      let tag =signReader.readVarint32();
      debug('signature:', tag);
      switch (tag){
        case env.Tags.SignTags.PublicKeyTag:
          sign.Publickey = signReader.readBuffer(signReader.readVarint32());
          if(!crx.header.id)
            crx.header.id = calculateId(sign.Publickey);
        break;
        case env.Tags.SignTags.SignatureKeyTag:
          sign.signature = signReader.readBuffer(signReader.readVarint32());
        break;
        default:
          loop = false;
      }
    }
    return crx.header[type].push(sign);
  }

  function parseVersion3(){
    let headerLength=0;
    let headerBuffer=null;
    function getHeaderLength(){
      if (!checkLength(4, getHeaderLength))
        return;
      headerLength = rawReader.readUInt32LE();
      getHeaderBuffer();
    }
    getHeaderLength();
    if (headerLength > env.MaxHeaderSize)
      return exit(new Error('Exceed max length: header'));

    function getHeaderBuffer(){
      if (!checkLength(headerLength, getHeaderBuffer))
        return;
      headerBuffer = rawReader.readBuffer(headerLength);
      parseHeader();
      pipeToUnzip();
    }

    function parseHeader(){
      let headerReader = new BufferReader(headerBuffer);
      crx.header = {};
      debug(`header length:${headerLength}`);
      let loop=true;
      while(headerReader.pos < headerReader.length && loop){
        let tag = headerReader.readVarint32();
        debug('header tag:', tag);
        switch (tag){ //tag for rsa/ecsa
          case env.Tags.AsymmetricKeyTags.sha256_with_rsa:
            parseAsymmetricKey('sha256_with_rsa',
              headerReader.readBuffer(headerReader.readVarint32())
          );
          break;
          case env.Tags.AsymmetricKeyTags.sha256_with_ecdsa:
            parseAsymmetricKey('sha256_with_ecdsa',
            headerReader.readBuffer(headerReader.readVarint32())
          );
          break;
          case env.Tags.SignDataTag:
            {
              let crxIdReader = new BufferReader(headerReader.readBuffer(headerReader.readVarint32()));
              if(crxIdReader.readVarint32() == env.Tags.CrxIdTag)
                crx.header.crx_id = crxIdReader.readBuffer(crxIdReader.readVarint32());
            }
          break;
          default:
            loop=false;
        }
      }
    }
  }

  function magicAndVersion(){
    if(!checkLength(8, magicAndVersion))
      return;
    switch(rawReader.readBuffer(4).toString('ascii')){
      case env.MagicNums.Diff:
        crx.diff = true;
      case env.MagicNums.Normal:
      break;
      default:
        return exit(new Error("Unexpected CRX magic number"));
    }
    switch(crx.version=rawReader.readUInt32LE()){
      case 2:
      case 3:
        break;
      default:
        return exit(new Error('Unexpected CRX version'));
    }
    if(crx.version == 2 || crx.diff)
      parseVersion2();
    else
      parseVersion3();
  }

  function exit(error){
    if (error) err = error;
    i18nReplace(crx.manifest, _locales, locales[0]);
    callback(err, crx);
  }

  function pipeToUnzip(){
    createIconDir();
    combineStream.append(rawReader.readBuffer(rawReader.length - rawReader.pos))
    .on('end',()=>debug('combine end.'))
    .pipe(unzip.Parse())
    .on('entry',entry=>{
      debug(entry.path);
      let localeMatch = LocaleReg.exec(entry.path)
      if(entry.path==='manifest.json'){
        addThread('extract manifest')
        entry.pipe(concat({encoding: 'string'}, data=>{
          try{
            crx.manifest = JSON.parse(data)

          }catch(e){}
          decThread('extract manifest');
        }))
      }
      else if (localeMatch && ~locales.indexOf(localeMatch[1])){
        addThread('extract locale file');
        entry.pipe(concat({encoding:'string'}, data=>{
          try{
            _locales[localeMatch[1]]= JSON.parse(data);
          }catch(e){}
          decThread('extract locale file');
        }))
      }
      else if(iconDir && crx.manifest &&
          crx.manifest.icons &&
          ~Object.values(crx.manifest.icons).indexOf(entry.path)){
        for (let prop in crx.manifest.icons){
          if (crx.manifest.icons[prop]==entry.path){
            let imgFileName = iconDir +
              '/' + entry.path.match(/[^\/]+\.\w+$/)
            let fd=fs.openSync(imgFileName,'w');
            debug('extract:', imgFileName);
            crx.icons[prop]=imgFileName;
            addThread('extract icon')
            entry.pipe(fs.createWriteStream(imgFileName,{fd:fd, autoClose:true}))
              .on('close',()=>decThread('extract icon'));
            break;
          }
        }
      }
      else
        entry.autodrain();
    })
    .on('close',()=>{
      debug('unzip on close')
      decThread('main thread end');
    });
    pipeToNext=true;
  }

  fs.createReadStream(path)
    .on('error', error=>err = error)
    .on('end',()=>{
      debug('crx file onEnd');
      combineStream.append(null);
    })
    .on('close',()=>{
      debug('crx file onClose')
    })
    .on('data', chunk=>{
      debug('pipeTo', pipeToNext? 'unzip':'raw')
      if(pipeToNext){
        combineStream.append(chunk);
      }else{
        rawReader.appendBuff(chunk);
        next();
      }
    });
  magicAndVersion();
  addThread("main thread begin");
};