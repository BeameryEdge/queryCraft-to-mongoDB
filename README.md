# QueryCraft-To-MongoDB
Converts a [QueryCraft](https://github.com/BeameryHQ/QueryCraft) Filter Builder object into a function to filter arrays of objects.

[![NPM](https://nodei.co/npm/querycraft-to-mongodb.png)](https://npmjs.org/package/querycraft-to-mongodb)

[![npm version](https://badge.fury.io/js/querycraft-to-mongodb.svg)](https://badge.fury.io/js/querycraft-to-mongodb)
[![codecov](https://codecov.io/gh/BeameryHQ/QueryCraft-To-MongoDB/branch/master/graph/badge.svg)](https://codecov.io/gh/BeameryHQ/QueryCraft-To-MongoDB)
[![Known Vulnerabilities](https://snyk.io/test/github/beameryhq/querycraft-to-mongodb/badge.svg)](https://snyk.io/test/github/beameryhq/querycraft-to-mongodb)

## Installation

```sh
npm install --save 'querycraft-to-mongodb'
```

## Examples

Suppose we have a collection of data that satisfies the interface

```ts
interface Contact {
    id: string
    'list': { id: string }[]
    firstName: string
    lastName: string
    email: string
    createdAt: Date
    customFields: { id: string, value: number }[]
    assignedTo?: string
}
```

If we want a query the describes the logic:-
```
    first 50 items where
        fistName is bob
        lastName is doyle OR is not set
        assignedTo is anything
        list has an item where id is item1
    sorted (in ascending order) by the value property of the customField where id is custom1
    created less than 5 days ago
```

We can build build it as easily as:-

```ts
import { FilterBuilder, eq, lt, neq, any, find, where } from 'querycraft'
import toElastic from 'querycraft-to-mongodb'

async function getContacts(filter: FilterBuilder){
    const result = await client.search({
        explain: true,
        index: testIndexName,
        body: toElastic(filter, fieldIdMapFn)
    })

    await client.indices.clearCache({
        index: testIndexName,
    })

    return  result.hits.hits.map(prop('_source')) as Contact[]
    // -> filtered list of contacts
}

const filter = new FilterBuilder()
.where('firstName', eq('bob'))
.where('list', find(where('id', eq('item1'))))
.where('lastName', any([
    eq('doyle'),
    eq(null)
]))
.where('createdAt', lt({ daysAgo: 5 }))
.where('assignedTo', neq(null))
.setSortFieldId('customFields', 'custom1', 'value')
.setSortDirection('ASC')
.setLimit(50)

getContacts(filter)
.then(console.log)
// -> filtered list of contacts

```
