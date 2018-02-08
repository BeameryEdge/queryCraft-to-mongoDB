import { AbstractAggregationSource, Aggregation, FilterAggregation, BucketsAggregation, BucketsJSON, BucketsOptions, DateHistogramBucketsOptions, HistogramBucketsOptions } from "querycraft";
import toMongo from "./toMongo";
import { times } from "ramda";

const DATE_INTERVAL_MAP: { [dateInterval: string]: string } = {
    year: "%Y-01-01T00:00:00.000",
    month: "%Y-%m-01T00:00:00.000",
    day: "%Y-%m-%dT00:00:00.000",
    hour: "%Y-%m-%dT%H:00:00.000",
    minutes: "%Y-%m-%dT%H:%M:00.000",
    seconds: "%Y-%m-%dT%H:%M:%S.000",
    milliseconds: "%Y-%m-%dT%H:%M:%S.%L",
};

interface MongoDateToString {
    $dateToString: {
        format: string
        date: MongoFieldSelector
    };
}
interface MongoOp {
    [op:string]: MongoFieldSelector | MongoFieldSelector[];
}
type MongoFieldSelector = string | number | MongoDateToString | MongoOp
type MongoUnwindStage = { $unwind: any }
type MongoProjectionStage = { $project: any }
type MongoGroupStage = { $group: { _id: any, [field: string]: any } }
type MongoMatchStage = { $match: any }
type MongoAggregationStage = MongoMatchStage | MongoGroupStage | MongoProjectionStage | MongoUnwindStage

function isDateOptions(bucketsOptions: BucketsOptions): bucketsOptions is DateHistogramBucketsOptions {
    return 'dateInterval' in bucketsOptions
}

function isHistogramOptions(bucketsOptions: BucketsOptions): bucketsOptions is HistogramBucketsOptions {
    return 'interval' in bucketsOptions
}

function buildPipeline(b: BucketsJSON | undefined, i: number, _id: any): MongoAggregationStage[] {
    if (!b) return []
    else {
        _id[i] = '$'+b.fieldId
        const prePipeline: MongoAggregationStage[] = []
        const subPipeline = buildPipeline(b.subBuckets, i+1, _id)
        const pipeline: MongoAggregationStage[] = []
        const $group = {
            _id:Object.assign({},  times(j => `$_id.${j}`, i+1)),
            id: { $first: { $ifNull: [ '$_id.'+i, ''] } },
            value: { $sum: '$value' },
            buckets: {
                $push: {
                    id: '$id',
                    value: '$value',
                    buckets: '$buckets',
                }
            }
        }
        if (b.subFieldIds && b.subFieldProp) {
            prePipeline.push({
                $unwind: `$_id.${i}`
            })
            prePipeline.push({
                $match: {
                    [`_id.${i}.id`]:  { $in: b.subFieldIds }
                }
            })
            prePipeline.push({
                $project: {
                    [`_id.${i}`]:  `$_id.${i}.${b.subFieldProp}`,
                    id: 1,
                    value: 1,
                }
            })
        }

        if (isDateOptions(b)) {
            prePipeline.push({
                $project: {
                    [`_id.${i}`]:  {
                        $dateToString: {
                            format: DATE_INTERVAL_MAP[b.dateInterval],
                            date: `$_id.${i}`
                        }
                    },
                    id: 1,
                    value: 1,
                }
            })
        }

        if (isHistogramOptions(b)) {
            prePipeline.push({
                $project: {
                    [`_id.${i}`]:  {
                        $multiply: [{
                            $trunc: {
                                $divide: [
                                    `$_id.${i}`,
                                    b.interval
                                ]
                            }
                        }, b.interval]
                    },
                    id: 1,
                    value: 1,
                }
            })
        }

        if (b.values) {
            pipeline.push({
                $match: {
                    ['_id.'+i]:  { $in: b.values }
                }
            })
        }
        pipeline.push({ $group })
        if (!b.subBuckets) {
            delete $group.buckets
            pipeline.push({
                $project: {
                    _id: 1,
                    id: 1,
                    value: 1,
                    buckets: []
                }
            })
        }
        return [
            ...prePipeline,
            ...subPipeline,
            ...pipeline,
        ]
    }
}

function getBucketAggregation(bucketOptions: BucketsJSON): MongoAggregationStage[] {
    const _id: any = {}
    const pipeline: MongoAggregationStage[] = [{
        $group: {
            _id,
            value: { $sum: 1 },
        }
    }, ...buildPipeline(bucketOptions, 0, _id), {
            $project: {
                _id: 0,
                id: 1,
                value: 1,
                buckets: 1
            }
        }
    ]

    return pipeline
}

function getFilterAggregation(filter: FilterAggregation): MongoMatchStage[] {
    return [{
        $match: toMongo(filter).filter
    }]
}

function operationReducer(aggregation: Aggregation): MongoAggregationStage[] {
    switch (aggregation.type) {
        case 'filter':
            return getFilterAggregation(aggregation as FilterAggregation)
        case 'buckets':
            return getBucketAggregation(aggregation as BucketsAggregation)
        default:
            throw new Error('Unknown aggregation')
    }
}


export class MongoPipelineAggregationSource extends AbstractAggregationSource {
    sink(aggregations: Aggregation[]){
        let pipeline: MongoAggregationStage[] = [];
        let i = aggregations.length
        while (i--){
            pipeline.push(...operationReducer(aggregations[i]))
        }
        return pipeline
    }
}
