
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

export function isFormControlType(o: HTMLElement): boolean {
    return o instanceof HTMLInputElement || o instanceof HTMLSelectElement || o instanceof HTMLAreaElement;
}
