const fs = require('fs')
const zlib = require('zlib')

function makePNG(size, r, g, b) {
  function crc32(buf) {
    let c = 0xFFFFFFFF
    for (const byte of buf) { c ^= byte; for (let i=0;i<8;i++) c=(c>>>1)^(c&1?0xEDB88320:0) }
    return (c^0xFFFFFFFF)>>>0
  }
  function chunk(type, data) {
    const L=Buffer.alloc(4); L.writeUInt32BE(data.length)
    const T=Buffer.from(type), crc=Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([T,data])))
    return Buffer.concat([L,T,data,crc])
  }
  const ihdr=Buffer.alloc(13)
  ihdr.writeUInt32BE(size,0); ihdr.writeUInt32BE(size,4)
  ihdr[8]=8; ihdr[9]=2 // 8-bit RGB
  const raw=[]; for(let y=0;y<size;y++){raw.push(0);for(let x=0;x<size;x++)raw.push(r,g,b)}
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR',ihdr),
    chunk('IDAT',zlib.deflateSync(Buffer.from(raw))),
    chunk('IEND',Buffer.alloc(0))
  ])
}

fs.mkdirSync('build',{recursive:true})
fs.writeFileSync('build/icon.png', makePNG(1024, 255, 220, 80))
console.log('✓ build/icon.png created')
