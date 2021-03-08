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
 * @param object A jQueryObject whose selection is matched, or a HTMLElement to check if some cached element has selected it.
 */
export function findCachedElement(object: AbstractControl | JQuery | HTMLElement): AbstractControl | null {

    let selectedElements = object instanceof HTMLElement ? [object] : object instanceof AbstractControl ? [...object.toJQuery()] : object.toArray();

    return cachedControlsAndGroups
        .find(cachedControl => cachedControl.toJQuery().length === selectedElements.length
            && [...cachedControl.toJQuery()].every(element => selectedElements.includes(element as any))) ?? null;
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
