import {AbstractControl} from "../abstractControl";

/*========================== Cache ==========================*/
/**
 * Caches form controls so they are not initialized again.
 * Note: Declared in misc.ts so it's available in both input and validation.
 */
export const cachedControlsAndGroups: AbstractControl[] = [];

/**
 * Finds the cached version of the form control / group and returns it, otherwise returns null.
 *
 * Elements are matched by element(s) they select, i.e. control is matched if its element(s) have been previously selected,
 * and group is matched if all of its control and non-control elements have been previously selected.
 * @param object
 */
export function findCachedElement(object: AbstractControl | HTMLElement | HTMLElement[]): AbstractControl | null {

    let selectedElements: HTMLElement[] = object instanceof HTMLElement ? [object] : Array.isArray(object) ? object : [...[object.source]].flat();

    return cachedControlsAndGroups
        .find(cachedControl => {
            let elementsInCachedControl = [...[cachedControl.source]].flat();
            return elementsInCachedControl.length === selectedElements.length
                && elementsInCachedControl.every(element => selectedElements.includes(element as any));
        }) ?? null;
}

/**
 * Adds the provided form control / group to the cache.
 * @see findCachedElement()
 */
export function addToCache(abstractControl: AbstractControl): void {
    cachedControlsAndGroups.push(abstractControl);
}

/**
 * Removes the provided form control / group from the cache.
 * @param abstractControl A form control / group object, not a vanilla jQuery object.
 */
export function removeFromCache(abstractControl: AbstractControl): void {
    let cachedElement = findCachedElement(abstractControl);

    if (cachedElement == null)
        return;

    let index = cachedControlsAndGroups.indexOf(cachedElement);
    cachedControlsAndGroups.splice(index, 1);
}
