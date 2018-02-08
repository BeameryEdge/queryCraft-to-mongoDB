import "mocha"
import { assert } from "chai"
import { MongoPipelineAggregationSource } from './Aggregation'
import apply from 'querycraft-to-function'
import { BucketsAggregation, FilterAggregation, eq, Aggregation, AbstractAggregationSource } from 'querycraft'
import { times, pluck, prop, range } from 'ramda'
import * as moment from 'moment'
import { MongoClient, Collection, Db } from 'mongodb'
import { testContacts, Contact } from '../test/testContacts'
import * as Debug from 'debug'

const debug = Debug('querycraft-to-mongo')

const testDbName = 'querycraft-test-db'
const testCollectionName = 'contacts'

const wait = (delay: number) => new Promise(resolve => setTimeout(resolve, 1000))

describe('Aggregations',function(){

    let db: Db
    let collection: Collection;

    class MongoSource extends AbstractAggregationSource {
        mongoPipelineSource = new MongoPipelineAggregationSource()
        sink(aggregations?: Aggregation[]){
            return db.collection(testCollectionName)
            .aggregate(this.mongoPipelineSource.sink(aggregations || []))
            .toArray()
        }
    }

    before('Connect to mongodb client and set data', async function(){
        this.timeout(60000)
        db = await MongoClient.connect('mongodb://localhost:27017/'+testDbName)

        collection = db.collection(testCollectionName)

        debug('INFO', 'pushing contacts')
        await collection.insertMany(testContacts)
    })

    after('cleanup mongodb test index', async function(){
        await collection.drop()
        await db.close()
    })

    describe('BucketAggregations', function(){
        it('should let you group the object into buckets', async function(){
            const result = await new MongoSource()
            .pipe(new BucketsAggregation({
                fieldId: 'assignedTo'
            }))
            .sink()

            assert.sameMembers(pluck('id', result), ['', 'me', 'you', 'him', 'her'])
        })

        it('should let you group the object into buckets and restrict buckets to the given values', async function(){
            const result = await new MongoSource()
            .pipe(new BucketsAggregation({
                fieldId: 'assignedTo',
                values:  ['him', 'her']
            }))
            .sink()

            assert.sameMembers(pluck('id', result), ['him', 'her'])
        })

        it('should let you group the object into buckets, with sub-buckets', async function(){
            const result = await new MongoSource()
            .pipe(new BucketsAggregation({
                fieldId: 'assignedTo',
                subBuckets: {
                    fieldId: 'lastName',
                }
            }))
            .sink()

            assert.sameMembers(pluck('id', result), ['', 'me', 'you', 'him', 'her'])
            for (let bucket of result) {
                assert.sameMembers(pluck('id', bucket.buckets), ['', 'Smith', 'Western', 'Jones', 'Co', 'doyle'])
            }
        })

        it('should let you group a number field by an interval into buckets', async function(){
            const result = await new MongoSource()
            .pipe(new BucketsAggregation({
                fieldId: 'customFields',
                subFieldIds: ['custom1'],
                subFieldProp: 'value',
                interval: 10
            }))
            .sink()

            assert.sameMembers(pluck('id', result), range(0, 10).map($ => $*10))
        })

        it('should let you group a date field by an date-interval into buckets', async function(){
            const result = await new MongoSource()
            .pipe(new BucketsAggregation({
                fieldId: 'createdAt',
                dateInterval: 'month',

            }))
            .sink()

            const estimateBucketCount = Math.ceil((Date.now() - 1488542197631)/(1000*60*60*24*31))

            assert.approximately(result.length, estimateBucketCount, 1)
        })
    })
})
