import {AbstractControl} from "./abstractControl";
import {checkIfCheckboxControl, checkIfRadioControl, getCheckboxValue, getRadioValue} from "./common/misc";
import {asapScheduler, fromEvent, merge, Observable, Subject} from "rxjs";
import {addToCache, findCachedElement} from "./common/cache";
import {distinctUntilChanged, map, observeOn, share, startWith, tap} from "rxjs/operators";
import {FormGroup} from "./formGroup";
import {attachPopper, setValidationRulesFromAttributes} from "./validation/validation";
import {FormControlStatus, FormControlType, ValidationErrors} from "./common/types";

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

        // Handle empty controls $().asFormControl(), or if nothing's selected
        // if (jQueryObject.length === 0)
        //     throw 'Form controls have to be based on existing DOM elements. The selector used has returned no elements.'

        jQueryObject.each((_, element) => element.setAttribute('formControl', '')); // radio / checkbox controls have multiple elements.

        // If control belongs to shadow root, mark the host with an attribute
        if (jQueryObject.length && jQueryObject[0].getRootNode() instanceof ShadowRoot)
            (jQueryObject[0].getRootNode() as ShadowRoot).host.setAttribute('formControl-shadow-root', '');

        this.setupObservables(valueChangesUI, touchedUI$, dirtyUI$);

        addToCache(this);
    }

    /**
     * Sets a new value for the form control.
     *
     * @param value The new value for the control.
     */
    setValue(value: any): void {
        let $control = this.toJQuery();

        let isCheckbox = checkIfCheckboxControl($control);
        let isRadio = checkIfRadioControl($control);

        if (isCheckbox) {
            let shouldBeChecked = $control.filter('[type=checkbox]').val() === value.toString();
            $control.filter('[type=checkbox]').prop('checked', shouldBeChecked);
        } else if (isRadio) {
            value !== '' && value != null
                ? $control.filter('[value="' + value + '"]').prop('checked', true)
                : $control.prop('checked', false);
        } else
            ($control[0] as FormControlType).value = value;

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
    patchValue(value: any): void {
        this.setValue(value);
    }

    /**
     * Resets the form control, marking it `pristine` and `untouched`, and setting
     * the value to null.
     */
    reset(): void {
        this.markAsUntouched();
        this.markAsPristine();

        this.setValue('');
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

        this.subscriptions.add(s1).add(s2).add(s3);
    }

    /**
     * Starts tracking validity of the field(s) and creates notifications in the UI.
     */
    public enableValidation(withUIElements = true): this {

        if (this.isValidationEnabled)
            return this;

        (this as {isValidationEnabled: boolean}).isValidationEnabled = true;

        // Programmatically update the validity.
        this.manualValidityUpdateSubject = new Subject<void>();

        setValidationRulesFromAttributes(this as any);

        (this as {statusChanges: Observable<any>}).statusChanges = merge(
            this.valueChanges.pipe(observeOn(asapScheduler)),
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
