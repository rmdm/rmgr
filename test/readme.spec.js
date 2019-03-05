const rmgr = require('../')

const { MongoClient } = require('mongodb')
const Redis = require('ioredis')
const express = require('express')

describe('readme', function () {

    describe('main example', function () {

        it('closes all resources', async function () {

            const resources = rmgr()

            const mongoClient = await resources.add(
                () => MongoClient.connect(
                    'mongodb://localhost', { useNewUrlParser: true }),
                mongoClient => mongoClient.close()
            )

            const redis = await resources.add(
                (cb) => {
                    const redis = new Redis({ retryStrategy: () => false })
                    redis.once('error', cb)
                    redis.once('connect', function () {
                        cb(null, redis)
                    })
                },
                (redisClient, cb) => {
                    redisClient.quit(cb)
                }
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
                rmgr.timeout((server, cb) => server.close(cb), 100)
            )

            await resources.close()
        })
    })
})
