rmgr
====

A resource manager. Release resources gracefully.

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
    () => MongoClient.connect(),
    mongoClient => mongoClient.close()
)

const redis = await resources.add(
    () => new Redis(),
    (redisClient, cb) => redisClient.quit(cb)
)

const app = await resources.add(
    (cb) => express().listen(0, cb),
    (app, cb) => server.close(cb)
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
