import "mocha"
import { assert } from "chai"
import toMongo from './toMongo'
import apply from 'querycraft-to-function'
import {FilterBuilder, all, any, eq, find, gt, gte, lt, lte, neq, nfind, prefix, where} from 'querycraft'
import { times, pluck, prop } from 'ramda'
import * as moment from 'moment'
import { MongoClient, Collection, Db } from 'mongodb'
import { testContacts, Contact } from '../test/testContacts'
import * as Debug from 'debug'

const debug = Debug('querycraft-to-mongo')

const testDbName = 'querycraft-test-db'
const testCollectionName = 'contacts'

const wait = (delay: number) => new Promise(resolve => setTimeout(resolve, 1000))

function getIds<T extends { id: string }>(list: T[]){
    return list.map(({ id }) => id)
}


describe('toMongo',function(){
    const myFilter = new FilterBuilder()
        .where('firstName', prefix('j'))
        .where('lastName',any([
            eq('doyle'),
            eq(null)
        ]))
        .where('assignedTo', neq(null))
        .setSortFieldId('createdAt')
        .setSortDirection('ASC')
        .setLimit(50)
        .and()
            .where('lists.id', eq('list-1'))
            .or()
            .where('vacancies.id', eq('vacancy1'))

    let db: Db
    let collection: Collection;
    let fieldIdMapFn = (fieldId: string) => {
        switch (fieldId) {
            case 'firstName':
            case 'lastName':
            case 'primaryEmail.value':
                return fieldId + '.keyword'
            default:
                return fieldId
        }
    }

    async function testQuery(filter: FilterBuilder){
        return await apply(filter, testContacts)
    }

    async function makeQuery<T extends { id: string }>(filter?: FilterBuilder) {
        const body = toMongo(filter || new FilterBuilder())

        debug('INFO', JSON.stringify(body, null, 2))

        const result = await collection
            .find(body.filter)
            .sort(body.sort)
            .limit(body.limit)
            .toArray()

        return result
    }

    before('Connect to mongodb client and set data', async function(){
        this.timeout(60000)
        db = await MongoClient.connect('mongodb://localhost:27017/'+testDbName)

        collection = db.collection(testCollectionName)

        debug('INFO', 'pushing contacts')
        await collection.insertMany(testContacts)
    })

    it('should limit the number of contacts returned', async function(){
        assert.equal((await makeQuery(new FilterBuilder().setLimit(10))).length, 10)
        assert.equal((await makeQuery(new FilterBuilder().setLimit(1))).length, 1)
        assert.equal((await makeQuery(new FilterBuilder().setLimit(100))).length, 100)
        assert.equal((await makeQuery(new FilterBuilder().setLimit(23))).length, 23)
        assert.equal((await makeQuery(new FilterBuilder()
            .setLimit(testContacts.length))).length, testContacts.length)

    })

    it('should generate an mongodb query that get the first 50 contacts with firstName = bob, sorted by ascending createdAt',async function(){
        const filter = new FilterBuilder()
            .where('firstName', eq('bob'))
            .setLimit(50)
            .setSortFieldId('createdAt')
            .setSortDirection('ASC')

        const hits = await makeQuery(filter);
        const expected = await testQuery(filter);
        assert.deepEqual(getIds(hits), getIds(expected))
    })

    it('should generate an mongodb query that get the first 10 contacts assigned to nobody, sorted by ascending createdAt',async function(){
        const filter = new FilterBuilder()
            .where('assignedTo', eq(null))
            .setLimit(10)
            .setSortFieldId('createdAt')
            .setSortDirection('ASC')

        const hits = await makeQuery(filter);
        const expected = await testQuery(filter);
        assert.deepEqual(getIds(hits), getIds(expected))
    })

    it('should generate an mongodb query that get the first 10 contacts assigned to me or her, sorted by ascending createdAt',async function(){
        const filter = new FilterBuilder()
            .where('assignedTo',any([
                eq('me'),
                eq('her')
            ]))
            .setLimit(10)
            .setSortFieldId('createdAt')
            .setSortDirection('ASC')

        const hits = await makeQuery(filter);
        const expected = await testQuery(filter);
        assert.deepEqual(getIds(hits), getIds(expected))
    })

    it('should generate an mongodb query that get the first 17 contacts in list-1 and list-2, sorted by ascending createdAt',async function(){
        const filter = new FilterBuilder()
            .where('lists', all([
                find(where('id', eq('list-1'))),
                find(where('id', eq('list-2')))
            ]))
            .setLimit(17)
            .setSortFieldId('createdAt')
            .setSortDirection('ASC')

        const hits = await makeQuery(filter);
        const expected = await testQuery(filter);
        assert.deepEqual(getIds(hits), getIds(expected))
    })

    it('should generate an mongodb query that get the first 7 contacts in list-1 or list-2, sorted by descending createdAt',async function(){
        const filter = new FilterBuilder()
            .where('lists', any([
                find(where('id', eq('list-1'))),
                find(where('id', eq('list-2')))
            ]))
            .setLimit(7)
            .setSortFieldId('createdAt')
            .setSortDirection('DESC')

        const hits = await makeQuery(filter);
        const expected = await testQuery(filter);
        assert.deepEqual(getIds(hits), getIds(expected))
    })

    it('should generate an mongodb query that get the first 50 contacts not deleted/archived where there are in one of the lists [list-1, list-2] or one of the vacancies [vacancy1, vacancy2] sorted descending', async function(){
        const filter = new FilterBuilder()
            .where('deletedAt', eq(null))
            .where('archivedAt', eq(null))
            .setLimit(5)
            .setSortFieldId('createdAt')
            .setSortDirection('DESC')
            .and()
                .where('lists', any([
                    find(where('id', eq('list-1'))),
                    find(where('id', eq('list-1'))),
                ]))
                .or()
                .where('vacancies', any([
                    find(where('id', eq('vacancy1'))),
                    find(where('id', eq('vacancy2'))),
                ]))

        const hits = await makeQuery(filter);
        const expected = await testQuery(filter);
        assert.deepEqual(getIds(hits), getIds(expected))
    })

    it('should generate an mongodb query that get the first 10 contacts created less than 10 days ago', async function(){
        const filter = new FilterBuilder()
            .where('createdAt', gt({ daysAgo: 10 }))

        const hits = await makeQuery(filter);
        const expected = testContacts
        .filter(({ createdAt }) => createdAt > new Date(new Date().setDate(new Date().getDate()-10)))
        .slice(0, 100)
        console.log(expected.length)

        assert.sameMembers(getIds(hits), getIds(expected))
    })

    it('should generate an mongodb query that get the first '+testContacts.length+' contacts created at a date <=the createdAt date of the first testContact', async function(){
        const filter = new FilterBuilder()
            .where('createdAt', lte(testContacts[0].createdAt))
            .setLimit(testContacts.length)
            .setSortFieldId('createdAt')
            .setSortDirection('DESC')

        const hits = await makeQuery(filter);
        const expected = await testQuery(filter);

        assert.deepEqual(getIds(hits), getIds(expected))
        assert.include(getIds(hits), testContacts[0].id)
    })

    it('should generate an mongodb query that get the first '+testContacts.length+' contacts created at a date <=and >= the createdAt date of the first testContact', async function(){
        const filter = new FilterBuilder()
            .where('createdAt', all([
                lte(testContacts[0].createdAt),
                gte(testContacts[0].createdAt)
            ]))
            .setLimit(testContacts.length)
            .setSortFieldId('createdAt')
            .setSortDirection('DESC')

        const hits = await makeQuery(filter);
        const expected = await testQuery(filter);

        assert.deepEqual(getIds(hits), getIds(expected))
        assert.include(getIds(hits), testContacts[0].id)
        assert.equal(hits.length, 1)
    })

    it('should generate an mongodb query that get the first '+testContacts.length+' contacts created at a date < the createdAt date of the first testContact', async function(){
        const filter = new FilterBuilder()
            .where('createdAt', lt(testContacts[0].createdAt))
            .setLimit(300)
            .setSortFieldId('createdAt')
            .setSortDirection('DESC')

        const hits = await makeQuery(filter);
        const expected = await testQuery(filter);

        assert.deepEqual(getIds(hits), getIds(expected))
        assert.notInclude(getIds(hits), testContacts[0].id)
    })

    it('< and >= should be disjoint', async function(){
        const filters = [
            new FilterBuilder()
            .where('createdAt', lt(testContacts[0].createdAt))
            .setLimit(testContacts.length)
            .setSortFieldId('createdAt')
            .setSortDirection('DESC'),
            new FilterBuilder()
            .where('createdAt', gte(testContacts[0].createdAt))
            .setLimit(testContacts.length)
            .setSortFieldId('createdAt')
            .setSortDirection('DESC')
        ]

        const hits = [await makeQuery(filters[0]), await makeQuery(filters[1])]

        assert.equal(hits[0].length+hits[1].length, testContacts.length)
    })

    it('should match elements whose customFields has a element that matches { id: "custom1" }', async function(){
        const filter = new FilterBuilder()
        .where('customFields', find(where('id',eq('custom1'))))
        .setLimit(5)

        const hits = await makeQuery(filter);
        const expected = await testQuery(filter);
        assert.deepEqual(getIds(hits), getIds(expected))
    })

    it('should match elements who have a vacancy1 in stage1', async function(){
        const filter = new FilterBuilder()
        .where('vacancies', find(
            where('id', eq('vacancy1'))
            .where('stage.id', eq('stage1'))
        ))
        .setLimit(50)

        const hits = await makeQuery(filter);
        const expected = await testQuery(filter);
        assert.deepEqual(getIds(hits), getIds(expected))
    })

    it('should page through results', async function(){
        const limit = 2, pages = 2;
        const myFilter = new FilterBuilder()
        .setSortFieldId('createdAt')
        .setSortDirection('DESC')
        .setLimit(limit)

        const results: Contact[] = []
        let lastItem: any;

        for (var count = 0; count < pages; count++) {
            const page = await makeQuery(myFilter.createPaginatedFilter(lastItem))
            lastItem = page[page.length-1]
            results.push.apply(results, page)
        }

        const resultsAll = await makeQuery(myFilter.setLimit(limit*pages))

        assert.deepEqual(results.map(prop('id')), resultsAll.map(prop('id')))
    })

    it('should allow you to sort by fistName is ANY of: not bob', async function(){
        const filter = new FilterBuilder()
        .where('firstName', any([neq('bob')]))
        .setSortDirection('DESC')
        .setLimit(100)

        const hits = await makeQuery(filter)
        const expected = await testQuery(filter)
        assert.deepEqual(getIds(hits), getIds(expected))
    })

    it('should allow you to find items where vancancies has no element that matches { id: "vacancy1", stage.id: "stage1" }', async function(){
        const filter = new FilterBuilder()
        .where('vacancies', nfind(
            where('id', eq('vacancy1'))
            .where('stage.id', eq('stage1'))
        ))
        .setSortDirection('DESC')
        .setLimit(100)

        const hits = await makeQuery(filter)
        const expected = await testQuery(filter)
        assert.deepEqual(getIds(hits), getIds(expected))
    })

    after('cleanup mongodb test index', async function(){
        await collection.drop()
        await db.close()
    })
})
