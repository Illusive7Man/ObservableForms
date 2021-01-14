import {JQueryInternal} from "../../@types/input";
import JQuery = JQueryInternal.JQueryInternal;

/*========================== Cache ==========================*/
/**
 * Caches form controls so they are not initialized again.
 * Note: Declared in misc.ts so it's available in both input and validation.
 */
export const cachedControlsAndGroups: JQuery<HTMLElement>[] = [];

/**
 * Finds the cached version of the form control / group and returns it, otherwise returns null.
 *
 * Elements are matched by element(s) they select, i.e. control is matched if its element(s) have been previously selected,
 * and group is matched if all of its control and non-control elements have been previously selected.
 * @param object A jQueryObject whose selection is matched, or a HTMLElement to check if some cached element has selected it.
 */
export function findCachedElement(object: JQuery<FormControlType | HTMLFormElement> | HTMLElement): JQuery<HTMLElement> | null {

    let selectedElements = object instanceof HTMLElement ? [object] : [...object];

    return cachedControlsAndGroups
        .find($cachedElement => $cachedElement.length === selectedElements.length
            && [...$cachedElement].every(element => selectedElements.includes(element as any))) ?? null;
}

/**
 * Adds the provided form control / group to the cache.
 * @see findCachedElement()
 */
export function addToCache(jQueryObject: JQuery<FormControlType | HTMLFormElement>): void {
    cachedControlsAndGroups.push(jQueryObject);
}

/**
 * Removes the provided form control / group from the cache.
 * @param jQueryObject A form control / group object, not a vanilla jQuery object.
 */
export function removeFromCache(jQueryObject: JQuery<FormControlType | HTMLFormElement>): void {
    let cachedElement = findCachedElement(jQueryObject);

    if (cachedElement == null)
        return;

    let index = cachedControlsAndGroups.indexOf(cachedElement);
    cachedControlsAndGroups.splice(index, 1);
}
