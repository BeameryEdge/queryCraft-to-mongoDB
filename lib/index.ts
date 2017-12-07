import { FilterBuilder, QueryBuilder, Condition, OrderCondition } from 'querycraft'
import { mergeDeep } from './util'

/**
 * Converts an OrderCondition into an mongodb range condition
 * if you are working with days ago you flip the logic of lt/gt as gt
 * 3days ago is a date lower than the date 3 days ago
 *
 * @param {OrderCondition} condition
 * @returns
 */
function getRangeCondition(condition: OrderCondition){
    const value =
        condition.value == null ||
        typeof condition.value === 'boolean' ||
        typeof condition.value === 'number' ||
        condition.value instanceof Date ||
        typeof condition.value === 'string' ?
            condition.value :
            new Date(new Date().setDate(new Date().getDate()-condition.value.daysAgo))
    return { ['$' + condition.op.toLowerCase()]: value }
}
function escapeRegExp(str: string) {
    return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
  }
/**
 * Convert a condition on a field to an MongoDB field condition
 *
 * @param {string} fieldId
 * @param {Condition} condition
 * @returns {*}
 */
function getMongoDBCondition(condition: Condition): any {
    switch (condition.op) {
        case 'EQ':
            return condition.value
        case 'NEQ':
            return { $ne: condition.value }
        case 'LT': case 'GT': case 'LTE': case 'GTE':
            return getRangeCondition(condition)
        case 'ALL':
            return { $and: condition.value.map(getMongoDBCondition) }
        case 'ANY':
            return { $or: condition.value.map(getMongoDBCondition) }
        case 'PREFIX':
            return { $regex: '^'+escapeRegExp(condition.value), $options: 'i' }
        case 'FIND':
            return { $elemMatch: queryAsMongoFilter(condition.value) }
        case 'NFIND':
            return { $not: { $elemMatch: queryAsMongoFilter(condition.value) } }
        default:
            throw new Error('Cannot generate MongoDB query for: ' + JSON.stringify(condition))
    }
}

/**
 * Convert a query object into an mongodb filter
 *
 * @param {QueryBuilder} query
 * @returns {*}
 */
function queryAsMongoFilter(query: QueryBuilder): any {
    const filter = { $and: [] } as any
    query.mapFieldConditions((fieldId, condition) => {
        const mongoCondition = getMongoDBCondition(condition)
        if (mongoCondition && mongoCondition.$and) {
            filter.$and.push(...mongoCondition.$and.map((subCondition: any) => ({
                [fieldId]: subCondition
            })))
        } else if (mongoCondition && mongoCondition.$or) {
            filter.$and.push({
                $or: mongoCondition.$or.map((subCondition: any) => ({
                    [fieldId]: subCondition
                }))
            })
        } else {
            filter[fieldId] = getMongoDBCondition(condition)
        }
    })
    if (filter.$and.length === 0) {
        delete filter.$and
    }
    return filter
}

/**
 * Convert a Filter object into the body of an object suitable for use in
 * mongo's runCommand
 *
 * @export
 * @param {FilterBuilder} filter
 * @returns
 */
export default function toMongo(filter: FilterBuilder){
    const [query, ...$and] = filter.getStatements()
        .filter(options => options.length)
        .map(options => options.map(queryAsMongoFilter))
        .map(mongoOptions => mongoOptions.length === 1 ?
            mongoOptions[0] : { $or: mongoOptions })

    if ($and.length > 0){
        query.$and = $and
    }

    const sortFieldId = filter.getSortFieldId()
    const order = { ASC: 1, DESC: -1 }[filter.getSortDirection()]

    const size = filter.limit
    const sort:any = { [sortFieldId]: order }

    return { filter: query, limit: size, sort }
}