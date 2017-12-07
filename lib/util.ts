/**
 * Simple object check.
 * @param item
 * @returns {boolean}
 */
function isObject(item: any) {
    return (item && typeof item === 'object' && !Array.isArray(item));
}

/**
 * Deep merge two objects.
 * @param target
 * @param ...sources
 */
export function mergeDeep(target: { [key: string]: any }, source: { [key: string]: any }): { [key: string]: any } {
    if (isObject(target) && isObject(source)) {
        for (const key in source) {
            if (Array.isArray(source[key])) {
                if (!target[key]) Object.assign(target, { [key]: [] });
                target[key] = [].concat(target[key], source[key])
            } else if (isObject(source[key])) {
                if (!target[key]) Object.assign(target, { [key]: {} });
                mergeDeep(target[key], source[key]);
            } else {
                Object.assign(target, { [key]: source[key] });
            }
        }
    }

    return target;
}