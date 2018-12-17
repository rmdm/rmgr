[![Build Status](https://travis-ci.org/rmdm/rmgr.svg?branch=master)](https://travis-ci.org/rmdm/rmgr)
[![Coverage Status](https://coveralls.io/repos/github/rmdm/rmgr/badge.svg?branch=master)](https://coveralls.io/github/rmdm/rmgr?branch=master)

rmgr
====

Helps you to release resources gracefully by handling initialization and disposal of the resources.

Install
=======

```sh
    npm i --save rmgr
```

Usage example
=============

**rmgr** exposes factory function that creates an **rmgr** instance.
For each (*resource*)[] you register its *initialize* and *dispose* functions with the instance's `add` method.
Then, whenever you need to release the resources you just call `close` method:

```javascript
const Resources = require('rmgr')

const { MongoClient } = require('mongodb')
const Redis = require('ioredis')
const express = require('express')

const resources = Resources()

/*
    In case of one of the following resources initialization failure,
    the app shutdowns gracefully (i.e. closes all yet inited resources)
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
        process.exit(1) // We've done our best
    }
})
```

The problem
===========

This section describes the problem this module solves.

It's tedious to set up graceful resource handling properly. Especially when there are several resources to manage.
Some of the resources may fail on initialization step and then all already initialized ones have to be teared down properly. Handling all this without a special helper leads to a messy cluttered code that gets worse with every single resource added:

```javascript

// With try-catch for every resource

const resourceA = await initResourceA()

try {

    const resourceB = await initResourceB()

    try {

        const resourceC = await initResourceC()

        try {

            // ... and so on

        } catch (err) {

            await close(resourceC)
        }

    } catch (err) {

        await close(resourceB)
    }

} catch (err) {

    await close(resourceA)
}

// With "if-inited" for every resource

let resourceA, resourceB, resourceC

try {

    resourceA = await initResourceA()
    resourceB = await initResourceB()
    resourceC = await initResourceC()

} catch (err) {

    if (resourceC) {
        await close(resourceC)
    }

    if (resourceB) {
        await close(resourceB)
    }

    if (resourceA) {
        await close(resourceA)
    }
}
```

**rmgr** helps to handle this in an easy-to-use, reliable and concise way:

```javascript

const resources = Resources()

const resourceA = await resources.add(
    () => initResourceA,
    resourceA => close(resourceA)
)

const resourceB = await resources.add(
    () => initResourceB,
    resourceB => close(resourceB)
)

const resourceC = await resources.add(
    () => initResourceC,
    resourceC => close(resourceC)
)

// yes, with **rmgr** try-catch is not required to close all the resources
// in a graceful way
```

Miscellaneous
=============

### Timeouts

There may be cases when you need to have timeouts. **rmgr** does not include this functionality, but there is (**timeoutable-wrapper**)[] module that can be used for these needs. Just wrap your *dispose* function with the wrapper:

```javascript
const resources = require('rmgr')()
const timeoutable = require('timeoutable-wrapper')

const resource = await resources.add(
    () => initResource(),

    // throws TimeoutError if 1 sec passed after dispose started but not finished
    timeoutable(resource => closeResource(resource), 1000)
)
```

*Note on using timeouts in this way with initializers:* you generally should not use timeouts with initializers, because in case of successuful initialization, that occurs after expired timeout, **rmrg** has no way to get the initialized instance of the resource, and has no chance to close it.

### on `process.exit`



### What to count as a resource?

Almost everything, but a rule of a thumb is that you would add to **rmgr** everything that will prevent your process from exiting.

### Combining several **rmgr**s

**rmgr**s can be combined if needed:

```javascript
const Resources = require('rmrg')

const subresources = Resources()
const otherSubresources = Resources()
const resourcesRoot = Resources()

subresources.add(/* */)
otherSubresources.add(/* */)

resourcesRoot.add(
    () => subresources,
    subresources => subresources.close()
)

resourcesRoot.add(
    () => otherSubresources,
    otherSubresources => otherSubresources.close()
)

// close all the resources from all rmgrs

await resourcesRoot.close()
```

API
===

#### `add (init, dispose) => Promise`

#### `close () => Promise`

#### `rmgr.using(PromiseLib) => rmgr`
