import {AbstractControl} from "./abstractControl";
import {checkIfCheckboxControl, checkIfRadioControl, getCheckboxValue, getRadioValue} from "./common/misc";
import {asapScheduler, fromEvent, merge, Observable, Subject} from "rxjs";
import {addToCache, findCachedElement} from "./common/cache";
import {distinctUntilChanged, map, observeOn, share, startWith, tap} from "rxjs/operators";
import {FormGroup} from "./formGroup";
import {attachPopper, setValidationRulesFromAttributes} from "./validation/validation";
import {FormControlStatus, FormControlType, ValidationErrors} from "./common/types";

/**
 * Tracks the value and validation status of an individual form control.
 *
 * This is one of the two fundamental building blocks of Observable forms, along with
 * `FormGroup`. It extends the `AbstractControl` class that
 * implements most of the base functionality for accessing the value, validation status,
 * user interactions and events. See [usage examples below](#usage-notes).
 *
 * @see `AbstractControl`
 * @see [Usage Notes](#usage-notes)
 *
 * @usageNotes
 *
 * ### Initializing Form Controls
 *
 * Instantiate a `FormControl`.
 *
 * ```ts
 * let control = $('#my-input').asFormControl();
 * console.log(control.value);     // '<value of the input>'
 *```
 *
 * The following example initializes the control with a validator.
 *
 * ```ts
 * let control = $('#my-input').asFormControl().enableValidation().setValidators([Validators.required]);
 * console.log(control.value);      // ''
 * console.log(control.status);     // 'INVALID'
 * ```
 *
 * @publicApi
 */
export class FormControl<TValue = any> extends AbstractControl {

    value: TValue;
    public readonly valueChanges!: Observable<TValue>;
    protected valueChangesSubject: Subject<TValue>;

    constructor(
        jQueryObject: JQuery,
        valueChangesUI?: Observable<TValue>,
        touchedUI$?: Observable<void>,
        dirtyUI$?: Observable<void>
    ) {
        super(jQueryObject);

        // See if it's cached
        let cachedElement = findCachedElement(jQueryObject);
        if (cachedElement)
            return cachedElement as FormControl<TValue>;

        // No empty controls without valueChangesUI provided
        if (jQueryObject.length === 0 && valueChangesUI == null)
            throw 'Empty controls must have valueChanges provided.'

        jQueryObject.each((_, element) => element.setAttribute('formControl', '')); // radio / checkbox controls have multiple elements.

        // If control belongs to shadow root, mark the host with an attribute
        if (jQueryObject.length && jQueryObject[0].getRootNode() instanceof ShadowRoot)
            (jQueryObject[0].getRootNode() as ShadowRoot).host.setAttribute('formControl-shadow-root', '');

        this.setupObservables(valueChangesUI, touchedUI$, dirtyUI$);

        if (jQueryObject.length !== 0)
            addToCache(this);
    }

    /**
     * Sets a new value for the form control.
     *
     * @param value The new value for the control.
     */
    setValue(value: TValue): void {
        let $control = this.toJQuery();

        let isCheckbox = checkIfCheckboxControl($control);
        let isRadio = checkIfRadioControl($control);

        if (isCheckbox) {
            let shouldBeChecked = $control.filter('[type=checkbox]').val() === value.toString();
            $control.filter('[type=checkbox]').prop('checked', shouldBeChecked);
        } else if (isRadio) {
            value as any !== '' && value != null
                ? $control.filter('[value="' + value + '"]').prop('checked', true)
                : $control.prop('checked', false);
        } else
            ($control[0] as FormControlType).value = value as any;

        this.valueChangesSubject.next(getFormControlValue(this.toJQuery() as JQuery<FormControlType>) as any);
    }

    /**
     * Patches the value of a control.
     *
     * This function is functionally the same as {@link FormControl#setValue setValue} at this level.
     * It exists for symmetry with {@link FormGroup#patchValue patchValue} on `FormGroups`,
     * where it does behave differently.
     *
     * @see `setValue` for options
     */
    patchValue(value: TValue): void {
        this.setValue(value);
    }

    /**
     * Resets the form control, marking it `pristine` and `untouched`, and setting
     * the value to null.
     */
    reset(): void {
        this.markAsUntouched();
        this.markAsPristine();

        this.setValue('' as any);
    }

    protected setupObservables(valueChangesUI?: Observable<any>,
                               touchedUI$?: Observable<void>,
                               dirtyUI$?: Observable<void>): void {

        super.setupObservables();

        valueChangesUI = valueChangesUI != null
            ? valueChangesUI
            : fromEvent(this.toJQuery(), 'input').pipe(startWith(''), map(_ => getFormControlValue(this.toJQuery() as JQuery<FormControlType>)))
            // Note: startWith() is used to calculate the initial value.

        let s1 = valueChangesUI.subscribe(value => this.valueChangesSubject.next(value));

        // Touched state
        touchedUI$ = touchedUI$
            ? touchedUI$
            : fromEvent(this.toJQuery(), 'focus') as any;

        let s2 = touchedUI$.subscribe(_ => this.markAsTouched());

        // Dirty state
        dirtyUI$ = dirtyUI$
            ? dirtyUI$
            : valueChangesUI

        let s3 = dirtyUI$.subscribe(_ => this.markAsDirty());

        this.subscriptions.add(s1);
        this.subscriptions.add(s2);
        this.subscriptions.add(s3);


        /*=== Status observables ===*/

        // Programmatically update the validity.
        this.manualValidityUpdateSubject = new Subject<void>();

        setValidationRulesFromAttributes(this as any);

        (this as {statusChanges: Observable<any>}).statusChanges = merge(
            this.valueChanges,
            this.manualValidityUpdateSubject.asObservable(),
            this.disabledSubject.pipe(distinctUntilChanged())
        ).pipe(
            startWith(''),
            tap(_ => (this as {errors: ValidationErrors}).errors = this.getValidators()?.map(validatorFn => validatorFn(this)).reduce((acc, curr) => curr ? {...acc, ...curr} : acc, null)),
            map(_ => this.toJQuery().attr('disabled') ? FormControlStatus.DISABLED : this.errors ? FormControlStatus.INVALID : FormControlStatus.VALID),

            share()
        );

        // Subscribe for status update
        this._existingValidationSubscription =
            this.statusChanges.subscribe(status => (this as {status: FormControlStatus}).status = status);

    }

    valueMap(mapFn: (value: TValue) => any): this {
        return super.valueMap(mapFn);
    }

    /**
     * Starts tracking validity of the field(s) and creates notifications in the UI.
     */
    public enableValidation(withUIElements = true): this {

        if (this.isValidationEnabled)
            return this;

        (this as {isValidationEnabled: boolean}).isValidationEnabled = true;

        // Attach popper
        if (withUIElements && this.toJQuery().length)
            attachPopper(this);

        return this;
    }


}

export function getFormControlValue($formControl: JQuery<FormControlType>): string {
    let isCheckbox = checkIfCheckboxControl($formControl);
    let isRadio = checkIfRadioControl($formControl);

    return !isCheckbox && !isRadio
        ? $formControl[0].value
        : isCheckbox
            ? getCheckboxValue($formControl as JQuery<HTMLInputElement>)
            : getRadioValue($formControl as JQuery<HTMLInputElement>);
}
