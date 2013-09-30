#!/usr/bin/env node

const blorg = require('blorg')
    , fs    = require('fs')

function build () {
  blorg(__dirname, blorg.archetypes.presentation({
      files  : { root: './index.md' }
    , output : '../index.html'
  }))
}

build()

if (process.argv[2] == '--watch')
  fs.watchFile('./index.md', { interval: 500 }, build)