import {AbstractControl} from "./abstractControl";
import {checkIfRadioControl, constructControls, convertArrayToJson, convertJsonToArray, isFormControl} from "./common/misc";
import {FormControl, getFormControlValue} from "./formControl";
import {asapScheduler, asyncScheduler, BehaviorSubject, fromEvent, merge, Observable, Subject, Subscription} from "rxjs";
import {addToCache, findCachedElement} from "./common/cache";
import {delay, distinctUntilChanged, filter, map, observeOn, share, startWith, switchMap, tap} from "rxjs/operators";
import {attachPopper} from "./validation/validation";
import {ControlTree, ControlTreePath, DeepPartial, FormControlStatus, FormControlType, ValidationErrors, ValidatorFn} from "./common/types";


/**
 * Tracks the value and validity state of a group of `FormControl` instances.
 *
 * Form group aggregates controls found in the subtree of the selected element(s) into one object,
 * with each control's name as the key. Name is either control's name attribute or one manually provided.
 *
 * Class of this object accepts a type parameter representing the model of the form group,
 * which provides type checking when working with the controls and values.
 *
 * @usageNotes
 *
 * ### Create a form group with 2 controls
 *
 * ```
 * let form = $('form').asFormGroup<{first: string; last: string;}>();
 *
 * console.log(form.value);   // {first: 'Nancy', last; 'Drew'}
 * console.log(form.status);  // 'VALID'
 * ```
 *
 * ### Create a form group with a group-level validator
 *
 * You define group-level validators using the setValidators method.
 * These come in handy when you want to perform validation
 * that considers the value of more than one child control.
 *
 * ```
 * let form = $('#passwords input').asFormGroup<{password: string; passwordConfirm: string}>()
 *      .enableValidation().setValidators([passwordMatchValidator]);
 *
 *
 * function passwordMatchValidator(g: FormGroup) {
 *    return g.controls.password.value === g.controls.passwordConfirm.value
 *       ? null : {'mismatch': true};
 * }
 * ```
 *
 * @publicApi
 */
export class FormGroup<TControls = any> extends AbstractControl {

    public readonly value: TControls;

    /**
     * A collection of child controls. The key for each child is the name
     * under which it is registered.
     * By default, the name attribute of the html element is used,
     * but a custom name can be  provided when using `addControl`.
     */
    controls: ControlTree<TControls>;

    private controlsArraySubject: BehaviorSubject<FormControl[]> = new BehaviorSubject<FormControl[]>([]);
    controlsArray$: Observable<FormControl[]> = this.controlsArraySubject.asObservable();
    controlsArray: FormControl[];

    get unindexedArray(): {name: string, control: FormControl}[] {
        return convertJsonToArray(this.controls, true)
            .filter(({name, value}) => value instanceof FormControl)
            .map(({name, value}) => ({name, control: value as FormControl}));
    }


    constructor(
        jQueryObject?: JQuery,
        private valueChangesUI?: Observable<any>,
        private touchedUI$?: Observable<void>,
        private dirtyUI$?: Observable<void>
    ) {
        super(jQueryObject);

        if (jQueryObject == null || jQueryObject.length === 0) {
            this.setupEmptyGroup();
            return;
        }

        // See if it's cached
        let cachedElement = findCachedElement(jQueryObject);
        if (cachedElement)
            return cachedElement as FormGroup<TControls>;

        let selectedControlElements = [...jQueryObject].flatMap(element =>
            isFormControl(element)
                ? element
                : [...element.querySelectorAll('input, select, textarea, [formControl]'),
                    ...[...element.querySelectorAll('[formControl-shadow-root]')].flatMap(shadowHost => [...shadowHost.shadowRoot.querySelectorAll('input, select, textarea, [formControl]')])]) as FormControlType[];

        this.controls = constructControls(selectedControlElements);

        this.controlsArraySubject.next(flattenControls(this.controls).filter(c => c));
        let s1 = this.controlsArray$.subscribe(controlsArray => this.controlsArray = controlsArray);

        this.setupObservables(valueChangesUI, touchedUI$, dirtyUI$);

        addToCache(this);

        this.subscriptions.add(s1);
    }

    /**
     * Marks the group and all its child controls as `touched`.
     * @see `markAsTouched()`
     */
    markAllAsTouched(): void {
        this.markAsTouched();

        this.controlsArray.forEach(control => control.markAsTouched());
    }

    markAsUntouched(opts: {onlySelf?: boolean} = {}): void {
        super.markAsUntouched();

        this.controlsArray.forEach(control => control.markAsUntouched());
    }

    /**
     * Marks the group and all its child controls as `dirty`.
     * @see `markAsTouched()`
     */
    markAllAsDirty(): void {
        this.markAsDirty();

        this.controlsArray.forEach(control => control.markAsDirty());
    }

    markAsPristine(): void {
        super.markAsPristine();

        this.controlsArray.forEach(control => control.markAsPristine());
    }

    disable(): void {
        this.updateGroupOncePause = true;
        this.controlsArray.forEach(control => control.disable());
        this.updateGroupOncePause = false;

        this.valueChangesSubject.next({});
        this.disabledSubject.next(true);
    }

    enable(): void {
        this.updateGroupOncePause = true;
        this.controlsArray.forEach(control => control.enable());
        this.updateGroupOncePause = false;

        this.valueChangesSubject.next(getFormGroupValue(this));
        this.disabledSubject.next(false);
    }

    public readonly valueChanges!: Observable<TControls>;

    /**
     * Sets the value of the `FormGroup`. It accepts an object that matches
     * the structure of the group, with control names as keys.
     *
     * @usageNotes
     * ### Set the complete value for the form group
     *
     * ```
     * const form = $('form').asFormGroup<{first: string, last: string}>();
     * console.log(form.value);   // {first: '', last: ''}
     *
     * form.setValue({first: 'Nancy', last: 'Drew'});
     * console.log(form.value);   // {first: 'Nancy', last: 'Drew'}
     * ```
     *
     * @throws When strict checks fail, such as setting the value of a control
     * that doesn't exist or if you exclude a value of a control that does exist.
     *
     * @param value The new value for the control that matches the structure of the group.
     */
    setValue(value: TControls): void {

        let unindexedValue = convertJsonToArray(value);

        // Groups apply all of the provided values
        this.checkAllValuesPresent(unindexedValue);

        this.updateGroupOncePause = true;

        let unindexedArray = this.unindexedArray;
        for (let {name, value} of unindexedValue) {
            this.throwIfControlMissing(name);
            unindexedArray.find(({name: controlName,}) => controlName === name).control.setValue(value);
        }

        this.valueChangesSubject.next(value);
        this.updateGroupOncePause = false;
    }

    /**
     * Patches the value of the `FormGroup`. It accepts an object with control
     * names as keys, and does its best to match the values to the correct controls
     * in the group.
     *
     * It accepts both super-sets and sub-sets of the group without throwing an error.
     *
     * @usageNotes
     * ### Patch the value for a form group
     *
     * ```
     * const form = $('form').asFormGroup<{first: string, last: string}>();
     * console.log(form.value);   // {first: null, last: null}
     *
     * form.patchValue({first: 'Nancy'});
     * console.log(form.value);   // {first: 'Nancy', last: null}
     * ```
     *
     * @param value The object that matches the structure of the group.
     */
    patchValue(value: DeepPartial<TControls>): void {

        let unindexedValue = convertJsonToArray(value);

        this.updateGroupOncePause = true;

        let unindexedArray = this.unindexedArray;
        for (let {name, value} of unindexedValue) {
            unindexedArray.find(({name: controlName,}) => controlName === name)?.control.setValue(value);
        }

        this.valueChangesSubject.next({...this.value, ...value});
        this.updateGroupOncePause = false;
    }


    /**
     * Resets the `FormGroup`, marks all descendants `pristine` and `untouched` and sets
     * the value of all descendants to ''.
     *
     * You reset to a specific form state by passing in a map of states
     * that matches the structure of your form, with control names as keys. The state
     * is a standalone value or a form state object with both a value and a disabled
     * status.
     *
     * @param value Resets the control with an initial value,
     * or an object that defines the initial value and disabled state.
     *
     * @usageNotes
     *
     * ### Reset the form group values
     *
     * ```ts
     * const form = new FormGroup({
     *   first: new FormControl('first name'),
     *   last: new FormControl('last name')
     * });
     *
     * console.log(form.value);  // {first: 'first name', last: 'last name'}
     *
     * form.reset({ first: 'name', last: 'last name' });
     *
     * console.log(form.value);  // {first: 'name', last: 'last name'}
     * ```
     *
     * ### Reset the form group values and disabled status
     *
     * ```
     * const form = new FormGroup({
     *   first: new FormControl('first name'),
     *   last: new FormControl('last name')
     * });
     *
     * form.reset({
     *   first: {value: 'name', disabled: true},
     *   last: 'last'
     * });
     *
     * console.log(form.value);  // {last: 'last'}
     * console.log(form.get('first').status);  // 'DISABLED'
     * ```
     */
    reset(): void {
        this.markAsUntouched();
        this.markAsPristine();

        this.updateGroupOncePause = true;

        this.unindexedArray.forEach(({name, control}) => control.reset());

        this.valueChangesSubject.next(getFormGroupValue(this));
        this.updateGroupOncePause = false;
    }


    private setupEmptyGroup(valueChangesUI?: Observable<any>, touchedUI$?: Observable<void>, dirtyUI$?: Observable<void>): void {
        this.controls = {} as ControlTree<any>;
        this.jQueryObject = $();

        this.controlsArraySubject.next([]);
        let s1 = this.controlsArray$.subscribe(controlsArray => this.controlsArray = controlsArray);

        this.setupObservables(valueChangesUI, touchedUI$, dirtyUI$);

        this.subscriptions.add(s1);
    }


    protected setupObservables(valueChangesUI?: Observable<any>,
                               touchedUI$?: Observable<void>,
                               dirtyUI$?: Observable<void>): void {

        super.setupObservables();

        valueChangesUI = valueChangesUI != null
            ? valueChangesUI
            : this.controlsArray$.pipe(
                switchMap(controls =>
                    merge(...controls.flatMap(c => [c.valueChanges, (c as any).disabledSubject])).pipe(filter(_ => !this.updateGroupOncePause), observeOn(asyncScheduler), startWith(''), map(_ => getFormGroupValue(this)))
                    // Note 1: startWith() sets the value when the controls array changes
                    // Note 2: asyncScheduler makes sure value change of an individual control would trigger its subscription handlers before group one's would. (RxJS is synchronous by default)

                )
            );

        let s1 = valueChangesUI.subscribe(value => this.valueChangesSubject.next(value));

        // Touched state
        touchedUI$ = touchedUI$
            ? touchedUI$
            : this.controlsArray$.pipe(
                switchMap(controls =>
                    merge(...controls.map(c => (c as any).touchedSubject.asObservable())).pipe(filter((isTouched: boolean) => isTouched), observeOn(asyncScheduler), map(_ => null))
                ));

        let s2 = touchedUI$.subscribe(_ => this.markAsTouched());

        // Dirty state
        dirtyUI$ = dirtyUI$
            ? dirtyUI$
            : this.controlsArray$.pipe(
                switchMap(controls =>
                    merge(...controls.map(c => (c as any).dirtySubject.asObservable())).pipe(filter((isDirty: boolean) => isDirty), observeOn(asyncScheduler), map(_ => null))
                ));

        let s3 = dirtyUI$.subscribe(_ => this.markAsDirty());

        this.subscriptions.add(s1).add(s2).add(s3);
    }

    valueMap(mapFn: (value: TControls) => any): this {
        return super.valueMap(mapFn);
    }

    /**
     * Starts tracking validity of the field(s) and creates notifications in the UI.
     */
    public enableValidation(withUIElements = true): this {

        if (this.isValidationEnabled)
            return this;

        (this as {isValidationEnabled: boolean}).isValidationEnabled = true;

        let s1 =
        this.controlsArray$.subscribe(controls => controls.forEach(control => !control.isValidationEnabled && control.enableValidation(withUIElements)));

        // Programmatically update the validity.
        this.manualValidityUpdateSubject = new Subject<void>();

        // Enabled/disabled is retrieved from status, so this observable is handled locally
        let isGroupDisabled = false;
        this.disabledSubject.subscribe(isDisabled => isGroupDisabled = isDisabled);

        (this as {statusChanges: Observable<any>}).statusChanges = merge(
                this.valueChanges.pipe(observeOn(asapScheduler)),
                this.controlsArray$.pipe(switchMap(controls => merge(...controls.map(c => (c as any).hiddenSubject.pipe(distinctUntilChanged()))).pipe(startWith('')))),
                this.manualValidityUpdateSubject.asObservable(),
                this.disabledSubject.pipe(distinctUntilChanged())
            ).pipe(
                startWith(''),
                // Note 1: Status changes when the value changes, which includes changes in enabled/disabled of its controls
                // Note 2: When one of the controls becomes (or stops being) hidden, status should recalculate

                filter(_ => !this.updateGroupOncePause),
                startWith(''),
                tap(_ => (this as {errors: ValidationErrors}).errors = this.getValidators()?.map(validatorFn => validatorFn(this)).reduce((acc, curr) => curr ? {...acc, ...curr} : acc, null)),
                map(_ => isGroupDisabled
                    ? FormControlStatus.DISABLED
                    : this.errors || this.controlsArray.some(formControl => formControl.errors && formControl.enabled && [...formControl.toJQuery()].some(e => e.getAttribute('type') !== 'hidden'))
                    ? FormControlStatus.INVALID : FormControlStatus.VALID),
                // Note: Invalid when either object itself or some of the selected non-hidden, non-disabled, controls have errors.

                share()
        );

        // Subscribe for status update
        let s2 =
            this.statusChanges.subscribe(status => (this as {status: FormControlStatus}).status = status);

        // Attach popper
        if (withUIElements)
            attachPopper(this);

        this._existingValidationSubscription = new Subscription().add(s1).add(s2);

        return this;
    }

    /**
     * Gets the synchronous validators that are active on this control.
     */
    getValidators(): ValidatorFn<FormGroup<TControls>>[] | null {
        return super.getValidators();
    }

    /**
     * Sets the synchronous validators that are active on this control.  Calling
     * this overwrites any existing sync validators.
     */
    setValidators(newValidators: ValidatorFn<FormGroup<TControls>>[]): this {
        this.validators = newValidators;
        this.updateValidity();
        return this;
    }

    /**
     * When group's value changes directly, trigger valueChanges only once.
     */
    private updateGroupOncePause: boolean;

    private checkAllValuesPresent(unindexedValue: {name: string, value: any}[]): void {

        let controlNames = this.unindexedArray.filter(({name, control}) => control.enabled).map(({name,}) => name);

        for (let name of controlNames)
            if (unindexedValue.find(e => e.name === name) === undefined)
                throw new Error(`Must supply a value for form control with name: '${name}'.`);

    }


    throwIfControlMissing(name: string): void {
        if (this.unindexedArray.every(({name: controlName,}) => controlName !== name))
            throw new Error(`Cannot find form control with name: ${name}.`);
    }

    logErrors(): void {
        if (this.errors)
            console.log(this.errors);

        this.unindexedArray.forEach(({control, name}) => control.errors != null && console.log(name, control.errors, control));
    }

    /**
     * Add a control to this group.
     *
     * This method also updates the value and validity of the control.
     *
     * @param control Provides the control for the given name
     * @param name The control name to add to the collection
     * @param indexes Indexes of array elements used in the name
     */
    addControl(control: FormControl, name: ControlTreePath<TControls> | string, ...indexes: number[]): this {
        if (indexes.length)
            indexes.forEach(index => name = (name as string).replace('%d', index.toString()));

        let unindexedArray = this.unindexedArray;

        let existingControl = unindexedArray.find(({name: controlName, }) => controlName === name);
        if (existingControl) {
            console.warn('Control is already in the group. Use setControl() to change it.');
            return this;
        }
        unindexedArray.push({name: name as string, control});

        this.controls = convertArrayToJson(unindexedArray.map(({name, control}) => ({name, value: control})));
        this.controlsArraySubject.next(flattenControls(this.controls).filter(c => c));

        return this;
    }

    /**
     * Remove a control from this group.
     *
     * @param name The control name to remove from the collection
     * @param indexes Indexes of array elements used in the name
     */
    removeControl(name: ControlTreePath<TControls> | string, ...indexes: number[]): this {
        if (indexes.length)
            indexes.forEach(index => name = (name as string).replace('%d', index.toString()));

        let unindexedArray = this.unindexedArray;

        let existingControl = unindexedArray.find(({name: controlName, }) => controlName === name);
        if (existingControl == null)
            return this;

        unindexedArray.splice(unindexedArray.indexOf(existingControl), 1);

        this.controls = convertArrayToJson(unindexedArray.map(({name, control}) => ({name, value: control})));
        this.controlsArraySubject.next(flattenControls(this.controls).filter(c => c));

        return this;
    }

    /**
     * Replace an existing control.
     *
     * @param control Provides the control for the given name
     * @param name The control name to replace in the collection
     * @param indexes Indexes of array elements used in the name
     */
    setControl(control: FormControl, name: ControlTreePath<TControls> | string, ...indexes: number[]): this {
        if (indexes.length)
            indexes.forEach(index => name = (name as string).replace('%d', index.toString()));

        let unindexedArray = this.unindexedArray;

        let existingControl = unindexedArray.find(({name: controlName, }) => controlName === name);
        if (existingControl == null) {
            console.error('Can\'t set the control if it\'s not in the group. Use addControl() to add it.');
            return this;
        }

        unindexedArray.splice(unindexedArray.indexOf(existingControl), 1);
        unindexedArray.push({name: name as string, control});

        this.controls = convertArrayToJson(unindexedArray.map(({name, control}) => ({name, value: control})));
        this.controlsArraySubject.next(flattenControls(this.controls).filter(c => c));

        return this;
    }


    /**
     * Check whether there is an enabled control with the given name in the group.
     *
     * Reports false for disabled controls. If you'd like to check for existence in the group
     * only, use {@link AbstractControl#get get} instead.
     *
     * @param controlName The control name to check for existence in the collection
     * @param indexes Indexes of array elements used in the name
     * @returns false for disabled controls, true otherwise.
     */
    contains(controlName: ControlTreePath<TControls> | string, ...indexes: number[]): boolean {
        if (indexes)
            indexes.forEach(index => controlName = (controlName as string).replace('%d', index.toString()));

        let unindexedArray = this.unindexedArray;
        let existingControl = unindexedArray.find(({name, }) => controlName === name);

        return existingControl != null && existingControl.control.enabled;
    }

}


/**
 * Converts a Controls object to a 1D array of JQuery controls.
 */
export function flattenControls(controls: ControlTree<any>): FormControl[] {

    let flattenedControls: FormControl[] = [];

    for (let value of Object.values(controls)) {
        if (value instanceof FormControl)
            flattenedControls.push(value);
        else if (value instanceof Array) {
            value = value.filter(e => e);   // Filter out empty values
            flattenedControls.push(...value.flatMap(arrayValue => arrayValue instanceof FormControl ? [arrayValue] : flattenControls(arrayValue)));
        }
        else if (value instanceof Object)
            flattenedControls.push(...Object.values(value).filter(e => e).flatMap(arrayValue => arrayValue instanceof FormControl ? [arrayValue] : flattenControls(arrayValue as any)));
    }

    return flattenedControls;
}

export function getFormGroupValue<TControls>(formGroup: FormGroup<TControls>): TControls {

    let notDisabledFilter = (control: ControlTree<any> | ControlTree<any>[] | FormControl) => !(control instanceof FormControl && control.disabled);

    // Visits leaf elements of the controls object, and maps them to their values.
    let mapControlsToValuesFn = (controls: ControlTree<any> | ControlTree<any>[] | FormControl) => {

        if (controls instanceof FormControl)
            return controls.value;
        else if (controls instanceof Array)
            return controls.filter(notDisabledFilter).map(e => mapControlsToValuesFn(e)).filter(e => e !== undefined);
        else if (controls instanceof Object)
            return Object.entries(controls).filter(entry => notDisabledFilter(entry[1])).reduce((acc, curr) => ({...acc, [curr[0]]: mapControlsToValuesFn(curr[1])}), {});
    }


    return mapControlsToValuesFn(formGroup.controls);
}
