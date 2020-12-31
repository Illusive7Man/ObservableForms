import {BehaviorSubject, EMPTY, fromEvent, merge, Observable, Subject} from "rxjs";
import {delay, distinctUntilChanged, filter, map, share, skip, switchMap, tap} from "rxjs/operators";
import {disableValidation, enableValidation, FormControlStatus, getValidators, hasError, setValidators, updateValidity} from "./validation";
import {checkIfRadioGroup, extractRadioGroups, isFormControlType} from "./misc";
import JQuery = JQueryInternal.JQueryInternal;
import {JQueryInternal} from "./@types/input";

export function extendFormElements(): void {
    let baseAttrFn = jQuery.fn.attr;
    let baseValFn = jQuery.fn.val;

    jQuery.fn.extend({
        val: function (value_function: any): any {

            if (value_function === undefined && this.isFormControl)
                return getFormControlValue(this);

            let result = baseValFn.apply(this, arguments);

            // Emit new valueChanges value.
            if (!(value_function instanceof Function) && value_function !== undefined && ($(this) as any).valueChangesSubject)
                this.each(_ => ($(this) as any).valueChangesSubject.next(value_function as string));

            return result;
        },
        attr: function (attributeName: string, value_function: any): JQuery<HTMLElement> {

            // Extend "disabled" attribute to affect autocomplete display fields,
            // and to trigger validation
            if (attributeName === 'disabled' && value_function !== undefined && isFormControlType(this[0])) {
                this.each(function () {

                    let name = $(this).attr('name');
                    if (name) {
                        let $sibling = $(this).siblings('[name="' + name + '_DISPLAY"]:eq(0)');
                        if ($sibling.length !== 0)
                            $sibling.attr('disabled', value_function);
                    }

                    if (value_function instanceof Function)
                        return;

                    setTimeout(() => {
                        if (value_function === true)
                            $(this).statusChangesSubject && $(this).statusChangesSubject.next(FormControlStatus.DISABLED);
                        else
                            $(this).updateValidity();

                    });
                });
            }

            if (attributeName === 'type' && value_function !== undefined) {
                if ($(this).is('[type=hidden]') && value_function !== 'hidden' || $(this).is(':not([type=hidden])') && value_function === 'hidden')
                    setTimeout(() => $(this).updateValidity());
            }

            return baseAttrFn.apply(this, arguments);
        },
        markAsTouched(): void {
            this.touched = true;
            this.touchedSubject.next(true);
        },
        markAllAsTouched(): void {
            this.touched = true;
            this.touchedSubject.next(true);
            
            this.selectedFormControls?.forEach($d => $d.markAsTouched());
        },
        markAsUntouched(): void {
            this.untouched = true;
            this.touchedSubject.next(false);

            this.selectedFormControls?.forEach($d => {
                $d.untouched = true;
                $d.touchedSubject.next(false);
            });
        },
        markAsDirty(): void {
            this.dirty = true;
            this.dirtySubject?.next(true);
        },
        markAllAsDirty(): void {
            this.markAsDirty();
            
            this.selectedFormControls?.forEach($d => $d.markAsDirty());
        },
        markAsPristine(): void {
            this.pristine = true;
            this.dirtySubject?.next(false);
            
            this.selectedFormControls?.forEach($d => {
                $d.pristine = true;
                $d?.dirtySubject?.next(false);
            })
        },
        enableValidation(): void {
            enableValidation(this);
        },
        disableValidation(): void {
            disableValidation(this);
        },
        setValidators(newValidator: ValidatorFn[] | null): void {
            return setValidators(this, newValidator);
        },
        getValidators(): ValidatorFn[] | null {
            return getValidators(this);
        },
        updateValidity(): void {
            return updateValidity(this);
        },
        hasError(errorCode: string): boolean {
            return hasError(this, errorCode);
        },
        reset(): void {
            this.markAsUntouched();
            this.markAsPristine();

            // TODO: handle if there's more than one form
            if (this[0] instanceof HTMLFormElement) {
                this[0].reset();
                return;
            }

            this.val('');

            let descendants = this.selectedFormControls;

            descendants.forEach($d => {
                $d.markAsUntouched();
                $d.markAsPristine();
                $d.val('');
            })
        },
        logErrors(): void {
            if (this.errors)
                console.log(this.errors);

            let descendants = this.selectedFormControls;
            descendants.forEach($e => $e.errors != null && console.log($e, $e.errors))
        },
        convertToFormControl(): JQuery<FormControlType | HTMLFormElement> {
            return convertToFormControl(this);
        }
    });

    let originalInit = (jQuery.fn as any).init;

    // formControl is the same as jQuery.fn.init, but with a more indicative name
    let formControl = function (args): void {
        return originalInit.apply(this, args);
    };
    formControl.prototype = originalInit.prototype;

    // Constructor
    (jQuery.fn as any).init = function () {
        let jQueryObject = new originalInit(arguments[0], arguments[1]);

        if (areFormControlsSelected(jQueryObject) === false)
            return jQueryObject;

        return convertToFormControl(new formControl(arguments) as JQuery<FormControlType | HTMLFormElement>);
    }

    function areFormControlsSelected(jQueryObject: JQuery<HTMLElement>): boolean {
        return jQueryObject.toArray().some(singleJQueryObject => isFormControlType(singleJQueryObject) || singleJQueryObject instanceof HTMLFormElement);
    }
}

export function convertToFormControl(jQueryObject: JQuery<FormControlType | HTMLFormElement>): JQuery<FormControlType | HTMLFormElement> {

    // See if it's cached
    let cachedElement = findCachedElement(jQueryObject);
    if (cachedElement)
        return cachedElement;

    // Add getter and setter for the 'selectedFormControls' property. Any updates to this value can now be observed.
    Object.defineProperty(jQueryObject, 'selectedFormControls', {
        get() {
            return this._selectedFormControls;
        },
        set(value: JQuery<FormControlType>[]) {
            this._selectedFormControls = value;
            this.selectedFormControlsSubject.next(value);
        }
    });

    jQueryObject.selectedFormControlsSubject = new BehaviorSubject<JQuery<FormControlType>[]>([]);
    jQueryObject.selectedFormControls$ = jQueryObject.selectedFormControlsSubject.asObservable();

    if (jQueryObject.length > 1 || jQueryObject[0] instanceof HTMLFormElement) {
        let selectedFormControlsElements = (jQueryObject[0] instanceof HTMLFormElement ? jQueryObject.find('input') : jQueryObject).toArray()
            .filter(htmlElement => isFormControlType(htmlElement)) as FormControlType[];

        jQueryObject.selectedFormControls =
            selectedFormControlsElements.filter(element => element.getAttribute('type') !== 'radio').map(element => $(element) as JQuery<FormControlType>)
                .concat(checkIfRadioGroup(jQueryObject) ? [jQueryObject as JQuery<FormControlType>] : Object.values(extractRadioGroups(jQueryObject)).map(controlElements => $(controlElements) as JQuery<FormControlType>));

    } else if (jQueryObject.length === 1)
        jQueryObject.selectedFormControls = [jQueryObject as JQuery<FormControlType>];
    else
        jQueryObject.selectedFormControls = [];

    // Check new selected elements if they are indeed form control
    jQueryObject.selectedFormControls$.pipe(skip(1)).subscribe(selectedFormControls =>
        selectedFormControls.filter($formControl => !$formControl.isFormControl).forEach($formControl => convertToFormControl($formControl)));


    addFormControlProperties(jQueryObject as JQuery<FormControlType>);

    // Cache it
    addToCache(jQueryObject);
    jQueryObject.isFormControl = true;

    return jQueryObject as JQuery<FormControlType>;
}

function addFormControlProperties(jQueryObject: JQuery<FormControlType | HTMLFormElement>): void {

    addComplementaryGettersSetters(jQueryObject);

    let valueChangesSubject = new Subject<any>();
    jQueryObject.valueChangesSubject = valueChangesSubject;

    jQueryObject.selectedFormControls$
        .pipe(
            switchMap(selectedFormControls => selectedFormControls.length === 1
                ? fromEvent(jQueryObject, 'input')
                : merge(...jQueryObject.selectedFormControls.map($formControl => $formControl.valueChanges)).pipe(delay(1))
                // Note: delay makes sure value change of an individual control would trigger subscription handlers before group one's would. (RxJS is synchronous by default)
                
            ))
        .subscribe(_ => valueChangesSubject.next(null));
    
    jQueryObject.valueChanges = valueChangesSubject.asObservable().pipe(map(_ => getFormControlValue(jQueryObject)), distinctUntilChanged(), share());
    
    // Dirty state
    jQueryObject.dirtySubject = new Subject<boolean>();
    jQueryObject.markAsPristine();
    
    jQueryObject.selectedFormControls$
        .pipe(
            switchMap(selectedFormControls => selectedFormControls.length === 1
                ? fromEvent(jQueryObject, 'input')
                : merge(...jQueryObject.selectedFormControls.map($formControl => $formControl.dirtySubject.asObservable())).pipe(filter(isDirty => isDirty), delay(1)))
        ).subscribe(_ => jQueryObject.markAsDirty());
    
    // Touched state
    jQueryObject.touchedSubject = new Subject<boolean>();
    jQueryObject.markAsUntouched();
    
    jQueryObject.selectedFormControls$
        .pipe(
            switchMap(selectedFormControls => selectedFormControls.length === 1
                ? fromEvent(jQueryObject, 'focus')
                : merge(...jQueryObject.selectedFormControls.map($formControl => $formControl.touchedSubject.asObservable())).pipe(filter(isTouched => isTouched), delay(1)))
        ).subscribe(_ => jQueryObject.markAsTouched());
}

/**
 * If checked, returns input's value, otherwise returns hidden namesake's value.
 */
export function getCheckboxValue(jQueryObject: JQuery<HTMLInputElement> | JQuery<HTMLInputElement>[]): string {
    let selectedFormControls = Array.isArray(jQueryObject) ? jQueryObject.map(e => e[0]) : jQueryObject.toArray();
    let isChecked = selectedFormControls.some(element => element.checked);

    if (isChecked)
        return selectedFormControls.find(element => element.checked).value; //val() would cause a loop
    else {
        let hiddenNamesake = selectedFormControls.find(element => element.getAttribute('type') == 'hidden');
        return hiddenNamesake ? hiddenNamesake.value.toString() : null;
    }
}


/*========================== Private Part ==========================*/

/**
 * Gets the value of the form control as string, if it's a single element, or as key value pair of field names and their values, if it's not a single element.
 */
function getFormControlValue(jQueryObject: JQuery<FormControlType | HTMLFormElement>): string | { [key: string]: any } {
    let selectedFormControls = jQueryObject.selectedFormControls;

    let result = {};

    // Handle checkboxes and radios 
    let namesakes: { [key: string]: JQuery<FormControlType>[] } = selectedFormControls.reduce((acc, curr) => {
        let name = curr.attr('name');
        acc[name] ? acc[name].push(curr) : (acc[name] = [curr]);
        return acc;
    }, {})

    for (let name in namesakes) {
        let formControls = namesakes[name];

        let areCheckboxes = formControls[0].attr('type') === 'checkbox';
        let areRadios = formControls[0].attr('type') === 'radio';

        result[name] = !areCheckboxes && !areRadios
            ? formControls[formControls.length - 1][0].value           // normal input
            : areCheckboxes
                ? getCheckboxValue(formControls as JQuery<HTMLInputElement>[])                    // checkbox
                : formControls[0].filter(':checked')[0].value;         // radio
    }

    // If only one namesake set is selected return its value (TODO: check what was this condition below)
    // if (Object.keys(namesakes).length === 1 && selectedFormControls.length === Object.values(namesakes).map((elements: []) => elements.length).reduce((acc, curr) => acc + curr, 0)) {
    if (Object.keys(namesakes).length === 1)
        return Object.values(result)[0];

    return result;
}

const cachedFormControls: JQuery<FormControlType | HTMLFormElement>[] = [];

/**
 * Finds the cached version of the form control and returns it, otherwise returns null.
 *
 * Elements are compared based on the results of the original query, and not on assigned selectedFormControls.
 * @param jQueryObject
 */
function findCachedElement(jQueryObject: JQuery<FormControlType | HTMLFormElement>): JQuery<FormControlType | HTMLFormElement> | null {
    return cachedFormControls
        .find($cachedFormControl => $cachedFormControl.length === jQueryObject.length && $cachedFormControl.toArray().every(element => jQueryObject.toArray().includes(element))) ?? null;
}

/**
 * Adds the provided form control to the cache.
 * @see findCachedElement()
 */
function addToCache(jQueryObject: JQuery<FormControlType | HTMLFormElement>): void {
    cachedFormControls.push(jQueryObject);
}

/**
 * Adds properties for touched - untouched, dirty - pristine.
 * @param jQueryObject
 */
function addComplementaryGettersSetters(jQueryObject: JQuery<FormControlType | HTMLFormElement>): void {
    // touched
    Object.defineProperty(jQueryObject, 'touched', {
        get() {
            return this._touched;
        },
        set(value: JQuery<FormControlType>[]) {
            this._touched = value;
            this._untouched = !value;
        }
    });

    // untouched
    Object.defineProperty(jQueryObject, 'untouched', {
        get() {
            return this._untouched;
        },
        set(value: JQuery<FormControlType>[]) {
            this._untouched = value;
            this._touched = !value;
        }
    });

    // dirty
    Object.defineProperty(jQueryObject, 'dirty', {
        get() {
            return this._dirty;
        },
        set(value: JQuery<FormControlType>[]) {
            this._dirty = value;
            this._pristine = !value;
        }
    });

    // pristine
    Object.defineProperty(jQueryObject, 'pristine', {
        get() {
            return this._pristine;
        },
        set(value: JQuery<FormControlType>[]) {
            this._pristine = value;
            this._dirty = !value;
        }
    });
}


