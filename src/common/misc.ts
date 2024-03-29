
/*========================== Input functionality ==========================*/
import {FormControl} from "../formControl";
import {ControlTree, FormControlType} from "./types";

/**
 * Returns true if it's either HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, or has the `formControl` attribute.
 */
export function isFormControl(htmlElement: HTMLElement): boolean {
    return (htmlElement instanceof HTMLElement) && (isInputElement(htmlElement) || htmlElement.getAttribute('formControl') != null);
}

export function isInputElement(htmlElement: Element): htmlElement is FormControlType {
    return htmlElement instanceof HTMLInputElement || htmlElement instanceof HTMLSelectElement || htmlElement instanceof HTMLTextAreaElement;
}

/**
 * Finds form controls in the subtree of the element.
 * @param element Html element to check along with its descendants.
 * @param onlyActive Find only elements that are currently used as controls.
 */
export function findFormControls(element: Element, onlyActive = false): Element[] {

    let controlSelector = onlyActive ? '[formControl]' : 'input, select, textarea, [formControl]';

    return element.matches(controlSelector)
        ? [element]
        : element.hasAttribute('formControl-shadow-root')
            ? [...element.children].flatMap(e => findFormControls(e, onlyActive)).concat([...element.shadowRoot.children].filter(child => !(child instanceof HTMLStyleElement)).flatMap(e => findFormControls(e, onlyActive)))
            : [...element.querySelectorAll(controlSelector),
                ...[...element.querySelectorAll('[formControl-shadow-root]')].flatMap(shadowHost => findFormControls(shadowHost))];
}


/**
 * Creates form controls from the provided elements.
 * Radio and checkbox elements with the same name are grouped into a single form control.
 *
 * @param controls Html elements to combine into controls.
 * @returns Object of combined controls or 'false' in cases when the provided elements all belong to a single control.
 * This prevents infinite loop when this function is used by the overridden jQuery constructor.
 */
export function constructControls(controls: FormControlType[]): ControlTree<any> {
    let checkboxElements = getCheckboxElements(controls);

    if (checkIfRadioControl(controls) || checkIfCheckboxControl(controls))
        return {[controls[0].getAttribute('name')]: new FormControl(controls.reduce((acc, curr) => acc.concat(curr), [] as FormControlType[]))};

    let combinedControlsArray = (controls
        .filter(element => element.getAttribute('type') !== 'radio' && checkboxElements.includes(element) === false) as (FormControlType | FormControlType[])[])
        .concat(combineRadiosAndCheckboxes(controls));

    combinedControlsArray = combinedControlsArray.filter(controlElements => Array.isArray(controlElements) ? controlElements[0]?.hasAttribute('name') : controlElements.hasAttribute('name'));    // Filter out the nameless controls

    return convertArrayToJson(combinedControlsArray.map(controlElements => ({name: Array.isArray(controlElements) ? controlElements[0]?.getAttribute('name')
            : controlElements.getAttribute('name'), value: new FormControl(controlElements)})));
}

/**
 * Generic conversion of unindexed array to a json.
 * @param unindexedArray Array of name-value pairs.
 */
export function convertArrayToJson(unindexedArray: {name: string, value: any}[]): any {
    let indexed_array = {};

    // Regex which captures index value
    let arrayRx = /\[(\d+)]$/;

    for (let n of unindexedArray) {

        let name = n['name'];

        if (name.endsWith(']'))
            name += '.';
        else if (name.includes('.') === false) {
            indexed_array[name] = n['value'];
            continue;
        }

        let property = name.split('.')[name.split('.').length - 1];
        let parents = name.split('.').slice(0, name.split('.').length - 1);

        // Handle MVC Index property
        if (property === 'Index')
            continue;

        let nestedProperty = indexed_array;
        let previousParentIndex = null; // <-- not null if previous parent was an array

        for (let parent of parents) {

            let parentIsArray = arrayRx.test(parent);

            let arrayIndex = null;
            if (parentIsArray) {
                arrayIndex = +parent.match(arrayRx)[1];
                parent = parent.replace(arrayRx, '');
            }

            // If null, create a new object or an array
            if ((previousParentIndex === null ? nestedProperty[parent] : nestedProperty[previousParentIndex][parent]) == null) {
                if (previousParentIndex === null)
                    nestedProperty[parent] = parentIsArray ? [] : {};
                else
                    nestedProperty[previousParentIndex][parent] = parentIsArray ? [] : {};
            }

            nestedProperty = previousParentIndex === null ? nestedProperty[parent] : nestedProperty[previousParentIndex][parent];

            previousParentIndex = parentIsArray ? arrayIndex : null;
        }


        if (previousParentIndex === null)
            property ? nestedProperty[property] = n['value'] : nestedProperty = n['value'];
        else {
            if (nestedProperty[previousParentIndex] == null)
                nestedProperty[previousParentIndex] = {};

            property ? nestedProperty[previousParentIndex][property] = n['value'] : nestedProperty[previousParentIndex] = n['value'];
        }
    }

    return indexed_array;
}

/**
 * Generic conversion of a json to an unindexed array.
 */
export function convertJsonToArray(value: any, ofFormControls = false, name?: string): {name: string, value: any}[] {
    let unindexedArray: {name: string, value: any}[] = [];

    name = name || '';
    if (value instanceof FormControl && ofFormControls)
        unindexedArray.push({name, value});
    else if (typeof value === 'object' && value != null) {
        for (let [index, val] of Object.entries(value)) {
            let newName = name == '' ? index : value instanceof Array ? name + '[' + index + ']' : name + '.' + index;

            unindexedArray.push(...convertJsonToArray(val, ofFormControls, newName));
        }
    } else if (!ofFormControls)
        unindexedArray.push({name, value});

    return unindexedArray;
}



/*========================== Checkbox & Radio ==========================*/

/**
 * Returns true if the provided object has selected only the radio elements with the same name.
 * @param object
 */
export function checkIfRadioControl(object: HTMLElement | FormControlType[]): boolean {
    let controls = Array.isArray(object)
        ? object
        : (object instanceof HTMLFormElement ? [...object.querySelectorAll('input')] : [object]).filter(htmlElement => isFormControl(htmlElement)) as FormControlType[];

    return controls.length === 0
        ? false
        : controls.every(element => element.getAttribute('type') === 'radio' && element.getAttribute('name') === controls[0].getAttribute('name'));
}

/**
 * Returns true if one of the element is type 'checkbox' and other is type 'hidden'. And with the same name.
 * @param object
 */
export function checkIfCheckboxControl(object: HTMLElement | FormControlType[]): boolean {
    let controls = Array.isArray(object)
        ? object
        : (object instanceof HTMLFormElement ? [...object.querySelectorAll('input')] : [object]).filter(htmlElement => isFormControl(htmlElement)) as FormControlType[];

    return controls.length === 1 && controls[0].getAttribute('type') === 'checkbox'
        || controls.length === 2 && controls[0].getAttribute('name') === controls[1].getAttribute('name')
            && controls.some(element => element.getAttribute('type') === 'checkbox') && controls.some(element => element.getAttribute('type') === 'hidden');
}

export function getCheckboxElements(formControls: FormControlType[]): FormControlType[] {
    let checkboxElements = formControls.filter(e => e.getAttribute('type') === 'checkbox');
    checkboxElements = [...checkboxElements,
        ...formControls.filter(e => e.getAttribute('type') === 'hidden' && checkboxElements.some(c => c.getAttribute('name') === e.getAttribute('name')))];

    return checkboxElements;
}

/**
 * Find radio and checkbox inputs and combines those with the same name into an array.
 * @param formControls Array of html elements of any type.
 * @returns Array of those arrays of combined elements.
 */
export function combineRadiosAndCheckboxes(formControls: FormControlType[]): HTMLInputElement[][] {
    let checkboxElements = getCheckboxElements(formControls);
    let targetFields = [...checkboxElements, ...formControls.filter(element => element.getAttribute('type') === 'radio')];

    let targetGroups = targetFields.reduce((acc, curr) => {
        let name = curr.getAttribute('name');
        acc[name] ? acc[name].push(curr) : (acc[name] = [curr]);
        return acc;
    }, {})

    return Object.values(targetGroups);
}

/**
 * If checked, returns input's value, otherwise returns hidden namesake's value.
 */
export function getCheckboxValue(elements: HTMLElement[]): string {
    let selector = '[type=checkbox]';
    let checkboxInput = elements.map(e => e.matches(selector) ? e : e.querySelector(selector)).filter(e => !!e)[0] as HTMLInputElement;
    let hiddenInput = elements.map(e => e.matches('[type=hidden]') ? e : e.querySelector('[type=hidden]')).filter(e => !!e)[0] as HTMLInputElement;

    return checkboxInput.checked ? checkboxInput.value : hiddenInput?.value ?? '';
}

/**
 * If any radio is checked returns its value, otherwise null;
 */
export function getRadioValue(elements: HTMLElement[]): string {
    let selector = '[type=radio]';
    let checkedRadio = elements.map(e => e.matches(selector) ? [e] : [...e.querySelectorAll(selector)]).flat()
        .find(e => (e as HTMLInputElement).checked) as HTMLInputElement;
    return checkedRadio?.value ?? '';
}

/*========================== Others ==========================*/

export function isNullOrWhitespace(searchTerm: string): boolean {
    return searchTerm == null || (/\S/.test(searchTerm)) === false;
}
