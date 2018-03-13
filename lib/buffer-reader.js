class BufferReader{
  constructor(buff){
    if(buff)
      this.buff = buff
    else
      this.buff = new Buffer(0);
    this.pos = 0
  }
  readUInt32LE(){
    this.pos +=4;
    return this.buff.readUInt32LE(this.pos -4);
  }

  readBuffer(len){
    this.pos +=len;
    return this.buff.slice(this.pos-len, this.pos);
  }

  readByte(){
    return this.buff.readUInt8(this.pos++);
  }

  readVarint32(){
    let tag = 0;
    let byteCount = 0;
    let byte = this.readByte()
    while(byte >= 0x80 && byteCount < 3){
      tag |= (byte & ~0x80) << 7*byteCount++
      byte = this.readByte();
    }
    return tag | (byte << 7*byteCount);
  }
  get length(){
    return this.buff.length;
  }

  appendBuff(buff){
    this.buff = Buffer.concat([this.buff, buff]);
  }
}

module.exports = BufferReader;