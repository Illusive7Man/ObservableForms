import {BehaviorSubject, fromEvent, merge, Observable, Subject, Subscription} from "rxjs";
import {delay, distinctUntilChanged, filter, map, share, skip, startWith, switchMap, tap} from "rxjs/operators";
import {
    checkIfCheckboxControl,
    checkIfRadioControl, combineControls,
    combineRadiosAndCheckboxes, convertArrayToJson, convertJsonToArray,
    getCheckboxElements,
    getCheckboxValue,
    getRadioValue,
    isValidFormControl
} from "./common/misc";
import JQuery = JQueryInternal.JQueryInternal;
import {JQueryInternal} from "../@types/input";
import {addToCache, findCachedElement, removeFromCache} from "./common/cache";


let originalInit = (jQuery.fn as any).init;

/**
 * Form control is the extended jQuery object of a single input element.
 */
let formControl = function (jQueryObject): void {
    originalInit.call(this, jQueryObject);
    this.isFormControl = true;
};

/**
 * Form group is the extended jQuery object of multiple input elements, or a form.
 */
let formGroup = function (jQueryObject): void {
    originalInit.call(this, jQueryObject);
    this.isFormGroup = true;
    this._ignoreUnnamedControls = true;
};
formControl.prototype = new originalInit();
formGroup.prototype = new originalInit();


/**
 * Used as jQuery constructor function to check and return a form control,
 * or a form group, if all of the selected elements are valid form elements,
 * such as input, select, textarea, form or have defined attribute `[formControl]`.
 */
export function overriddenConstructor () {
    // Skip unnecessary execution...
    if (arguments[0] instanceof Object && (arguments[0].isFormControl || arguments[0].isFormGroup))
        return arguments[0];

    // Original constructor
    let jQueryObject = new originalInit(arguments[0], arguments[1]);

    if (onlyFormControls(jQueryObject) === false)
        return jQueryObject;


    return isGroupSelected(jQueryObject) ? asFormGroup(jQueryObject) : asFormControl(jQueryObject);

    function onlyFormControls(jQueryObject: JQuery<HTMLElement>): boolean {
        return jQueryObject.toArray().length > 0 && jQueryObject.toArray().every(singleJQueryObject => isValidFormControl(singleJQueryObject) || singleJQueryObject instanceof HTMLFormElement);
    }

    function isGroupSelected(jQueryObject: JQuery<HTMLElement>): boolean {
        return jQueryObject.toArray().filter(singleJQueryObject => isValidFormControl(singleJQueryObject)).length > 1
            && !checkIfRadioControl(jQueryObject) && !checkIfCheckboxControl(jQueryObject) || jQueryObject[0] instanceof HTMLFormElement;
    }
}

/**
 * @see {@link JQuery.asFormControl}
 */
export function asFormControl(jQueryObject: JQuery<FormControlType | HTMLFormElement>,
                              name?: string,
                              valueChangesUI: Observable<any> = null,
                              touchedUI$: Observable<void> = null,
                              dirtyUI$: Observable<void> = null): JQuery<FormControlType> {

    // See if it's cached
    let cachedElement = findCachedElement(jQueryObject);
    if (cachedElement)
        return cachedElement as JQuery<FormControlType>;

    // Handle empty controls $().asFormControl(), or if nothing's selected
    if (jQueryObject.length === 0)
        jQueryObject = jQueryObject.add('<dummy-element></dummy-element>');

    // Use fancy names in the Dev console.
    jQueryObject = new formControl(jQueryObject);
    jQueryObject.each((_, element) => element.setAttribute('formControl', '')); // radio / checkbox controls have multiple elements.
    jQueryObject._controls = [jQueryObject as JQuery<FormControlType>];

    // If control belongs to shadow root, mark the host with an attribute
    if (jQueryObject[0].getRootNode() instanceof ShadowRoot)
        (jQueryObject[0].getRootNode() as ShadowRoot).host.setAttribute('formControl-shadow-root', '');

    if (name)
        jQueryObject[0].setAttribute('name', name);

    return convertToFormObject(jQueryObject, valueChangesUI, touchedUI$, dirtyUI$) as JQuery<FormControlType>;
}

/**
 * @see {@link JQuery.asFormGroup}
 */
export function asFormGroup(jQueryObject: JQuery<FormControlType | HTMLFormElement>,
                              valueChangesUI: Observable<any> = null,
                              touchedUI$: Observable<void> = null,
                              dirtyUI$: Observable<void> = null): JQuery<FormControlType | HTMLFormElement> {

    // See if it's cached
    let cachedElement = findCachedElement(jQueryObject);
    if (cachedElement)
        return cachedElement as any;

    jQueryObject = new formGroup(jQueryObject);
    let selectedControlElements = [...jQueryObject].flatMap(element =>
        isValidFormControl(element)
            ? element
            : [...element.querySelectorAll('input, select, textarea, [formControl]'),
                ...[...element.querySelectorAll('[formControl-shadow-root]')].flatMap(shadowHost => [...shadowHost.shadowRoot.querySelectorAll('input, select, textarea, [formControl]')])]) as FormControlType[];


    let controls = combineControls(selectedControlElements);

    // false -> group is a single control (infinite loop fix)
    if (controls === false)
        jQueryObject._controls = [jQueryObject as JQuery<FormControlType>];
    else
        jQueryObject._controls = controls;

    return convertToFormObject(jQueryObject, valueChangesUI, touchedUI$, dirtyUI$);
}


function convertToFormObject(jQueryObject: JQuery<FormControlType | HTMLFormElement>,
                             valueChangesUI: Observable<any> = null,
                             touchedUI$: Observable<void> = null,
                             dirtyUI$: Observable<void> = null): JQuery<FormControlType | HTMLFormElement> {

    // Add getter and setter for the 'controls' property. Any updates to this value can now be observed.
    Object.defineProperty(jQueryObject, 'controls', {
        get() {
            return this._controls;
        },
        set(value: JQuery<FormControlType>[]) {
            if (jQueryObject.isFormControl && value.length > 1) {
                transitionControlToGroup(jQueryObject as JQuery<FormControlType>, value);
                return;
            }

            this._controls = value;
            this.controlsSubject.next(value);
        },
        configurable: true
    });

    jQueryObject.controlsSubject = new BehaviorSubject<JQuery<FormControlType>[]>(jQueryObject.controls);
    jQueryObject.controls$ = jQueryObject.controlsSubject.asObservable();

    if (jQueryObject.isFormGroup)
        // Make sure selected elements are transformed as the list is updated
        jQueryObject.controls$.pipe(skip(1)).subscribe(controls =>
            controls.filter($formControl => !$formControl.isFormControl && !$formControl.isFormGroup).forEach($formControl => convertToFormObject($formControl)));


    addFormControlProperties(jQueryObject as JQuery<FormControlType>, valueChangesUI, touchedUI$, dirtyUI$);

    // Cache it
    addToCache(jQueryObject);

    return jQueryObject as JQuery<FormControlType>;
}

function addFormControlProperties(jQueryObject: JQuery<FormControlType | HTMLFormElement>,
                                  valueChangesUI: Observable<any> = null,
                                  touchedUI$: Observable<void> = null,
                                  dirtyUI$: Observable<void> = null): void {

    addSimpleProperties(jQueryObject);

    jQueryObject.valueChangesSubject = new Subject<any>();
    jQueryObject.valueChanges = jQueryObject.valueChangesSubject.asObservable().pipe(   // Subject so it can be triggered
        map(value => jQueryObject.valueMapFn?.(value) ?? value),                // Custom mapping
        distinctUntilChanged(), share());                                               // Distinct and shared

    jQueryObject.valueChanges.subscribe(value => jQueryObject.value = value);     // Assign to "value"

    valueChangesUI = valueChangesUI != null
        ? valueChangesUI
        : jQueryObject.controls$.pipe(
            switchMap(_ => jQueryObject.isFormControl
                ? fromEvent(jQueryObject, 'input').pipe(startWith(''), map(_ => getFormControlValue(jQueryObject as JQuery<FormControlType>)))
                : merge(...jQueryObject.controls.flatMap($c => [$c.valueChanges, $c.disabledSubject])).pipe(filter(_ => !jQueryObject.updateGroupOncePause), delay(1), startWith(''), map(_ => constructFormGroupValue(jQueryObject)))
                // Note 1: startWith() sets the value when the controls array changes
                // Note 2: delay makes sure value change of an individual control would trigger its subscription handlers before group one's would. (RxJS is synchronous by default)

            )
        );

    let s1 =
    valueChangesUI.subscribe(value => jQueryObject.valueChangesSubject.next(value));


    // Touched state
    jQueryObject.touchedSubject = new Subject<boolean>();
    jQueryObject.subscriptions = new Subscription();
    jQueryObject.markAsUntouched();

    touchedUI$ = touchedUI$
        ? touchedUI$
        : jQueryObject.controls$.pipe(
            switchMap(_ => jQueryObject.isFormControl
                ? fromEvent(jQueryObject, 'focus')
                : merge(...jQueryObject.controls.map($formControl => $formControl.touchedSubject.asObservable())).pipe(filter(isTouched => isTouched), delay(1))
            )) as any;

    let s2 =
    touchedUI$.subscribe(_ => jQueryObject.markAsTouched());


    // Dirty state
    jQueryObject.dirtySubject = new Subject<boolean>();
    jQueryObject.markAsPristine();

    dirtyUI$ = dirtyUI$
        ? dirtyUI$
        : jQueryObject.controls$.pipe(
            switchMap(_ => jQueryObject.isFormControl
                ? valueChangesUI
                : merge(...jQueryObject.controls.map($formControl => $formControl.dirtySubject.asObservable())).pipe(filter(isDirty => isDirty), delay(1))
            )) as any;

    let s3 =
    dirtyUI$.subscribe(_ => jQueryObject.markAsDirty());


    // Disabled subject
    jQueryObject.disabledSubject = new Subject<boolean>();

    jQueryObject.subscriptions.add(s1).add(s2).add(s3);
}

/**
 * Sets the value of the Form Group. It accepts an object that matches the structure of the group, with control names as keys.
 */
export function setValue(jQueryObject: JQuery<FormControlType | HTMLFormElement>, value: {[key: string]: any} | string): void {

    // Control's setValue() is a bit different from a default val()
    if (jQueryObject.isFormControl) {
        value = value as string;

        let isCheckbox = checkIfCheckboxControl(jQueryObject);
        let isRadio = checkIfRadioControl(jQueryObject);

        if (isCheckbox) {
            let shouldBeChecked = jQueryObject.filter('[type=checkbox]').val() === value.toString();
            jQueryObject.filter('[type=checkbox]').prop('checked', shouldBeChecked);
        } else if (isRadio) {
            value !== ''
                ? jQueryObject.filter('[value=' + value + ']').prop('checked', true)
                : jQueryObject.prop('checked', false);
        }
        else
            jQueryObject[0].value = value;

        jQueryObject.valueChangesSubject.next(value);
        return;
    }

    let unindexedValue = convertJsonToArray(value as {[key: string]: any});

    // Groups apply all of the provided values
    checkAllValuesPresent(jQueryObject, unindexedValue);

    jQueryObject.updateGroupOncePause = true;

    for (let {name, value} of unindexedValue) {
        throwIfControlMissing(jQueryObject, name);
        jQueryObject.controls.find($control => $control.attr('name') === name).val(value);
    }

    jQueryObject.valueChangesSubject.next(value);
    jQueryObject.updateGroupOncePause = false;
}

/**
 * Patches the value of the Form Group. It accepts an object with control names as keys, and does its best to match the values to the correct controls in the group.
 */
export function patchValue($formGroup: JQuery<FormControlType | HTMLFormElement>, value: {[key: string]: any}): void {

    let unindexedValue = convertJsonToArray(value as {[key: string]: any});

    $formGroup.updateGroupOncePause = true;

    for (let {name, value} of unindexedValue) {
        $formGroup.controls.find($control => $control.attr('name') === name)?.val(value);
    }

    $formGroup.valueChangesSubject.next({...$formGroup.value, ...value});
    $formGroup.updateGroupOncePause = false;
}

/**
 * Resets the Form Group, marks all descendants pristine and untouched and sets the value of all descendants to null.
 */
export function reset(jQueryObject: JQuery<FormControlType | HTMLFormElement>): void {

    jQueryObject.markAsUntouched();
    jQueryObject.markAsPristine();

    if (jQueryObject.isFormControl) {
        jQueryObject.val('');

    } else {
        jQueryObject.updateGroupOncePause = true;

        jQueryObject.controls.forEach($control => {
            $control.markAsUntouched();
            $control.markAsPristine();
            $control.val('');
        });

        jQueryObject.val(constructFormGroupValue(jQueryObject));

        jQueryObject.updateGroupOncePause = false;
    }

}


/*========================== Private Part ==========================*/

function getFormControlValue($formControl: JQuery<FormControlType>): string {
    let isCheckbox = checkIfCheckboxControl($formControl);
    let isRadio = checkIfRadioControl($formControl);

    return !isCheckbox && !isRadio
        ? $formControl[0].value
        : isCheckbox
            ? getCheckboxValue($formControl as JQuery<HTMLInputElement>)
            : getRadioValue($formControl as JQuery<HTMLInputElement>);
}

function constructFormGroupValue(jQueryObject: JQuery<FormControlType | HTMLFormElement>): { [key: string]: any } {
    let nonameIdx = 0;

    let controls = jQueryObject.controls;

    if (jQueryObject.ignoreUnnamedControls === true)
        controls = controls.filter($control => $control.attr('name'));

    let nonIndexedArray = controls
        .filter($control => !$control.attr('disabled'))             // Ignore disabled controls
        .map($control => ({
            name: $control.attr('name') ?? '_noname' + nonameIdx++, // To those without names, assign a new name (if not filtered out ↖)
            value: $control.value
        }));

    return convertArrayToJson(nonIndexedArray);
}

/**
 * Adds properties for touched - untouched, dirty - pristine.
 * Also adds ignoreUnnamedControls in groups.
 * @param jQueryObject
 */
function addSimpleProperties(jQueryObject: JQuery<FormControlType | HTMLFormElement>): void {

    // Note: configurable option is set so the property can later be deleted if necessary.

    // touched
    Object.defineProperty(jQueryObject, 'touched', {
        get() {
            return this._touched;
        },
        set(value: boolean) {
            this._touched = value;
            this._untouched = !value;
        },
        configurable: true
    });

    // untouched
    Object.defineProperty(jQueryObject, 'untouched', {
        get() {
            return this._untouched;
        },
        set(value: boolean) {
            this._untouched = value;
            this._touched = !value;
        },
        configurable: true
    });

    // dirty
    Object.defineProperty(jQueryObject, 'dirty', {
        get() {
            return this._dirty;
        },
        set(value: boolean) {
            this._dirty = value;
            this._pristine = !value;
        },
        configurable: true
    });

    // pristine
    Object.defineProperty(jQueryObject, 'pristine', {
        get() {
            return this._pristine;
        },
        set(value: boolean) {
            this._pristine = value;
            this._dirty = !value;
        },
        configurable: true
    });


    if (jQueryObject.isFormGroup) {

        // ignoreUnnamedControls
        Object.defineProperty(jQueryObject, 'ignoreUnnamedControls', {
            get() {
                return this._ignoreUnnamedControls;
            },
            set(value: boolean) {

                if (!this.isFormGroup) {
                    console.warn('ignoreUnnamedControls is used only in groups.')
                    return;
                }
                this._ignoreUnnamedControls = value;
                this.value = constructFormGroupValue(this); // update the value
            },
            configurable: true
        });
    }
}

/**
 * Makes sure every control in the group is present in the unindexedValue object.
 */
function checkAllValuesPresent($formGroup: JQuery<FormControlType | HTMLFormElement>, unindexedValue: {name: string, value: any}[]): void {

    let controlNames = $formGroup.controls.filter($control => !$control.attr('disabled')).map($control => $control.attr('name')).filter(name => name);

    for (let name of controlNames)
        if (unindexedValue.find(e => e.name === name) === undefined)
            throw new Error(`Must supply a value for form control with name: '${name}'.`);

}

function throwIfControlMissing($formGroup: JQuery<FormControlType | HTMLFormElement>, name: string): void {
    if ($formGroup.controls.map($control => $control.attr('name')).every(controlName => controlName !== name))
        throw new Error(`Cannot find form control with name: ${name}.`);
}

/**
 * Function called by the controls setter when number of controls is over one.
 * State is copied over into the new group.
 * Any transformations by other files need to be registered.
 *
 * @see {@link registerInputToGroupTransformation}
 *
 * @param $formControl
 * @param newControls
 */
function transitionControlToGroup($formControl: JQuery<FormControlType>, newControls: JQuery<FormControlType>[]): void {

    // Appropriate naming
    let $formGroup = $formControl;

    // Detach current jQuery object ($formControl) from the controls element.
    removeFromCache($formGroup);
    let $detachedControl = $formControl.asFormControl();
    addToCache($formGroup);

    // Copy state into the new control
    ($detachedControl as any).touched = $formGroup.touched;
    ($detachedControl as any).dirty = $formGroup.dirty;
    ($detachedControl as any).value = $formGroup.value;

    let usesCustomValueChanges = $formGroup.value !== getFormControlValue($formGroup);

    $formGroup._controls = [$detachedControl as any, ...newControls.filter($c => $c !== $formGroup)];
    $formGroup.controlsSubject.next($formGroup.controls);

    if (usesCustomValueChanges === false)
        $formGroup.value = constructFormGroupValue($formGroup);

    inputToGroupTransformations.forEach(transformation => transformation($formGroup, $detachedControl as any));

    $formGroup.isFormControl = false;
    $formGroup.isFormGroup = true;
}

let inputToGroupTransformations: (($newGroup: JQuery<FormControlType | HTMLFormElement>, $oldControl: JQuery<FormControlType>) => void)[] = [];

/**
 * Used to register needed transformation when converting control into group.
 * @param transformation
 */
export function registerInputToGroupTransformation(transformation: ($newGroup: JQuery<FormControlType | HTMLFormElement>, $oldControl: JQuery<FormControlType>) => void) {
    inputToGroupTransformations.push(transformation);
}


/**
 * @see {@link JQuery.destroyControl}
 */
export function destroyControl(jQueryObject: JQuery<FormControlType | HTMLFormElement>): void {

    // First, remove validation
    if (jQueryObject.isValidationEnabled)
        jQueryObject.disableValidation();

    // Close observables
    jQueryObject.valueChangesSubject.complete();
    jQueryObject.touchedSubject.complete();
    jQueryObject.dirtySubject.complete();
    jQueryObject.controlsSubject.complete();
    jQueryObject.disabledSubject.complete();
    jQueryObject.subscriptions.unsubscribe();

    // Delete added properties
    delete jQueryObject.valueChangesSubject;
    delete jQueryObject.touchedSubject;
    delete jQueryObject.dirtySubject;
    delete jQueryObject.disabledSubject;
    delete jQueryObject.controlsSubject;

    delete jQueryObject.valueChanges;
    delete jQueryObject.controls$;

    delete jQueryObject.value;
    delete jQueryObject.touched;
    delete jQueryObject.untouched;
    delete jQueryObject.dirty;
    delete jQueryObject.pristine;
    delete jQueryObject.ignoreUnnamedControls;
    delete (jQueryObject as any)._touched;
    delete (jQueryObject as any)._untouched;
    delete (jQueryObject as any)._dirty;
    delete (jQueryObject as any)._pristine;
    delete (jQueryObject as any)._ignoreUnnamedControls;

    removeFromCache(jQueryObject);
    delete jQueryObject._controls;
    delete jQueryObject.controls;

    delete jQueryObject.isFormControl;
}

/**
 * @see {@link JQuery.destroyGroup}
 */
export function destroyGroup(jQueryObject: JQuery<FormControlType | HTMLFormElement>): void {
    // jQueryObject.controls.forEach(destroyControl);
    destroyControl(jQueryObject);
    delete jQueryObject.isFormGroup;
}
