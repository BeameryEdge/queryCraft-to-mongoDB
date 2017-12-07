import { randomBytes } from 'crypto'
import { writeFileSync } from 'fs'
export interface Contact {
    id: string
    firstName?: string
    lastName?: string
    primaryEmail: { value: string }
    'primaryEmail.value'?: string
    createdAt: Date | string
    deletedAt?: Date | string
    archivedAt?: Date | string
    assignedTo?: string
    lists: { id: string }[]
    'lists.id'?: string
    vacancies: {
        id: string
        stage?: { id: string }
        'stage.id'?: string
    }[]
    'vacancies.id'?: string
    'vacancies.stage.id'?: string
    customFields: { id: string, value: number }[]
    'customFields.id'?: string
    'customFields.value'?: number
}

function generateString(length: number){
    return randomBytes(length).toString('base64')
}

function randomInteger(from: number, to: number){
    return Math.floor(Math.random()*(to-from)) + from
}

function randomFrom<T>(possibilities: T[]){
    return possibilities[randomInteger(0, possibilities.length)]
}

function randomChance(probability: number){
    return Math.random() < probability
}

function repeat<T>(N: number, fn: (i: number) => T): T[]{
    const output = new Array(N);
    for(let i = 0; i < N; i++) output[i] = fn(i)
    return output
}

function randomSubset<T>(possibilities: T[]){
    return possibilities.filter(possibility => randomChance(0.5))
}

function generateContact(i: number): Contact {
    return {
        id: ''+i,//generateString(10),
        firstName: randomFrom([undefined, 'bob', 'test', 'Bob', 'jeff', 'jon', 'jeremy', 'jessie', 'stacey']),
        lastName: randomFrom([undefined, 'Smith', 'Western', 'Jones', 'Co', 'doyle']),
        primaryEmail: {
            value: generateString(6) + (randomChance(0.8) ?'@':'') + generateString(3) + (randomChance(0.8) ? '.com': ''),
        },
        deletedAt: randomChance(0.8) ? new Date(randomInteger(1488542197631, Date.now())) : void 0,
        createdAt: new Date(randomInteger(Date.now()-1000*60*60*24*365, Date.now())),
        assignedTo: randomFrom([undefined, 'me', 'you', 'him', 'her']),
        lists: randomSubset([
            { id: 'list-1' },
            { id: 'list-2' },
            { id: 'list-3' },
        ]),
        vacancies: randomSubset([
            {
                id: 'vacancy1',
                stage: {
                    id: randomFrom(['stage1', 'stage2', 'stage3'])
                }
            },
            { id: 'vacancy2',
                stage: {
                    id: randomFrom(['stage1', 'stage2', 'stage3'])
                } },
            { id: 'vacancy3',
                stage: {
                    id: randomFrom(['stage1', 'stage2', 'stage3'])
                }
            },
        ]),
        customFields: randomSubset(repeat(4, id => ({
            id: 'custom' + id,
            value: randomInteger(0, 99)
        })))
    }
}

export const testContacts = repeat(300, generateContact)
