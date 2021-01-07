import {JQueryInternal} from "../@types/input";

/**
 * Caches form controls so they are not initialized again.
 * Note: Declared in misc.ts so it's available in both input and validation.
 */
export const cachedControlsAndGroups: JQueryInternal.JQueryInternal<FormControlType | HTMLFormElement>[] = [];

export function isNullOrWhitespace(searchTerm: string): boolean {
    return searchTerm == null || (/\S/.test(searchTerm)) === false;
}

/*========================== Input functionality ==========================*/

export function extractRadioGroups(jQueryObject: JQuery<FormControlType | HTMLFormElement>): {[name: string]: FormControlType[]} {
    let radioFields = (jQueryObject[0] instanceof HTMLFormElement ? jQueryObject.find('input') : jQueryObject).toArray().filter(element => element.getAttribute('type') === 'radio');

    let radioGroups = radioFields.reduce((acc, curr) => {
        if (acc[curr.getAttribute('name')])
            acc[curr.getAttribute('name')].push(curr);
        else
            acc[curr.getAttribute('name')] = [curr];
        return acc;
    }, {})

    return radioGroups;
}

/**
 * Returns true if the provided object has selected only the radio elements with the same name.
 * @param jQueryObject
 */
export function checkIfRadioGroup(jQueryObject: JQuery<any> | FormControlType[]): boolean {
    let selectedFormControls = Array.isArray(jQueryObject)
        ? jQueryObject
        : (jQueryObject[0] instanceof HTMLFormElement ? (jQueryObject).find('input') : jQueryObject).toArray().filter(htmlElement => isFormControlType(htmlElement)) as FormControlType[];

    return selectedFormControls.length === 0
        ? false
        : selectedFormControls.every(element => element.getAttribute('type') === 'radio' && element.getAttribute('name') === selectedFormControls[0].getAttribute('name'));
}

/**
 * Returns true if it's either HTMLInputElement | HTMLSelectElement | HTMLAreaElement.
 */
export function isFormControlType(htmlElement: HTMLElement): boolean {
    return htmlElement instanceof HTMLInputElement || htmlElement instanceof HTMLSelectElement || htmlElement instanceof HTMLAreaElement;
}


/*========================== Enums ==========================*/

const FormControlStatusEnum: {[index in FormControlStatus]: FormControlStatus} = {
    VALID: 'VALID' as FormControlStatus,
    INVALID: 'INVALID' as FormControlStatus,
    PENDING: 'PENDING' as FormControlStatus,
    DISABLED: 'DISABLED' as FormControlStatus
};
export {FormControlStatusEnum as FormControlStatus};
