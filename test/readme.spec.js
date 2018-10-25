const Resources = require('../')

const { MongoClient } = require('mongodb')
const Redis = require('ioredis')
const express = require('express')

describe('readme', function () {

    describe('main example', function () {

        it('works', async function () {

            const resources = Resources()

            const mongoClient = await resources.add(
                () => MongoClient.connect(
                    'mongodb://localhost', { useNewUrlParser: true }),
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

            await resources.close()
        })
    })
})
