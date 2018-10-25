[![Build Status](https://travis-ci.org/rmdm/rmgr.svg?branch=master)](https://travis-ci.org/rmdm/rmgr)
[![Coverage Status](https://coveralls.io/repos/github/rmdm/rmgr/badge.svg?branch=master)](https://coveralls.io/github/rmdm/rmgr?branch=master)

rmgr
====

Release resources gracefully.

Example
=======

```javascript
const Resources = require('rmgr')

const { MongoClient } = require('mongodb')
const Redis = require('ioredis')
const express = require('express')

const resources = Resources()

/*
    Whenever one of the following resource initializations fails,
    the app shutdowns gracefully (i.e. closes all the already inited resources)
    before reporting the error.
*/

const mongoClient = await resources.add(
    () => MongoClient.connect('mongodb://localhost'),
    mongoClient => mongoClient.close()
)

const redis = await resources.add(
    () => new Redis(),
    (redisClient, cb) => redisClient.quit(cb)
)

const server = await resources.add(
    (cb) => {
        const server = express().listen(0)
        server.once('error', cb)
        server.once('listening', function () {
            server.removeListener('error', cb)
            cb(null, server)
        })
    },
    (server, cb) => server.close(cb)
)

process.on('SIGINT', async function () {
    try {
        await resources.close()
    } catch (err) {
        console.error(err)
        process.exit(1) // We've done everything we can
    }
})
```
