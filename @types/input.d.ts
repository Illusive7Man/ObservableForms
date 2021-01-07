import {BehaviorSubject, Observable, Subject} from "rxjs";
// @ts-ignore
import {JQuery as JQueryOriginal} from '@types/jquery/JQuery';
import {Instance as PopperInstance} from '@popperjs/core';

declare global {
    type FormControlType = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    type ValidationErrors = {
        [key: string]: any;
    };

    interface ValidatorFn {
        (formControl: JQuery<FormControlType | HTMLFormElement>): ValidationErrors | null;
    }

    enum FormControlStatus {
        VALID = 'VALID',
        INVALID = 'INVALID',
        PENDING = 'PENDING',
        DISABLED = 'DISABLED'
    }

    abstract class JQuery<TElement = HTMLElement> implements JQueryOriginal<FormControlType> {

        /**
         * Converts a jQuery object to either form control or form group, depending on whether one or multiple input elements is selected.
         * Form control, or form groups' descendants which are form controls, are added to the {@link JQuery.selectedFormControls} array,
         * and each have been attached with the properties for:
         *  - observing values, {@link JQuery.valueChanges}
         *  - checking whether user's changed the value, {@link JQuery.dirty}
         *  - checking whether user's interacted any way with the control, {@link JQuery.touched}
         * @param valueChangesUI Observable to use for observing values, instead of the default `valueChanges`. Note: `val(value)` will also make it emit values.
         * @param touchedUI$ Sets `touched = true` every time it emits.
         * @param dirtyUI$ Sets `dirty = true` every time it emits.
         */
        convertToFormControl(valueChangesUI?: Observable<any>, touchedUI$?: Observable<void>, dirtyUI$?: Observable<void>): JQuery<FormControlType | HTMLFormElement>;
        /**
         * @description
         * Reports the value of the control if it is present, otherwise null.
         * Interchangeable with jQuery's `val()`.
         */
        readonly value: any;
        /**
         * @description
         * Reports whether the control is valid. A control is considered valid if no
         * validation errors exist with the current value.
         * If the control is not present, null is returned.
         */
        readonly valid: boolean | null;
        /**
         * @description
         * Reports whether the control is invalid, meaning that an error exists in the input value.
         * If the control is not present, null is returned.
         */
        readonly invalid: boolean | null;
        /**
         * An object containing any errors generated by failing validation,
         * or null if there are no errors.
         */
        readonly errors: ValidationErrors | null;
        /**
         * @description
         * Reports whether the control with the given path has the error specified.
         *
         */
        hasError(errorCode: string): boolean;
        /**
         * A control is `pristine` if the user has not yet changed
         * the value in the UI.
         *
         * @returns True if the user has not yet changed the value in the UI; compare `dirty`.
         * Programmatic changes to a control's value do not mark it dirty.
         */
        readonly pristine: boolean;
        /**
         * A control is `dirty` if the user has changed the value
         * in the UI.
         *
         * @returns True if the user has changed the value of this control in the UI; compare `pristine`.
         * Programmatic changes to a control's value do not mark it dirty.
         */
        readonly dirty: boolean;
        /**
         * True if the control is marked as `touched`.
         *
         * A control is marked `touched` once the user has triggered
         * a `blur` event on it.
         */
        readonly touched: boolean;
        /**
         * True if the control has not been marked as touched
         *
         * A control is `untouched` if the user has not yet triggered
         * a `blur` event on it.
         */
        readonly untouched: boolean;
        /**
         * The validation status of the control. There are four possible
         * validation status values:
         *
         * * **VALID**: This control has passed all validation checks.
         * * **INVALID**: This control has failed at least one validation check.
         * * **PENDING**: This control is in the midst of conducting a validation check.
         * * **DISABLED**: This control is exempt from validation checks.
         *
         * These status values are mutually exclusive, so a control cannot be
         * both valid AND invalid or invalid AND disabled.
         */
        readonly status: FormControlStatus;
        /**
         * A multicasting observable that emits an event every time the value of the control changes, in
         * the UI or programmatically.
         */
        readonly valueChanges: Observable<any>;
        /**
         * A multicasting observable that emits an event every time the validation `status` of the control
         * recalculates.
         *
         * @see {@link AbstractControl.status}
         *
         */
        readonly statusChanges: Observable<FormControlStatus>;
        readonly statusChangesSubject: Subject<FormControlStatus>;
        /**
         * Starts tracking validity of the field(s) and creates notifications in the UI.
         */
        enableValidation(): void;
        /**
         * Stops tracking validity of the field(s) and creates notifications in the UI.
         */
        disableValidation(): void;
        /**
         * Empties out the sync validator list.
         *
         * When you add or remove a validator at run time, you must call
         * `updateValueAndValidity()` for the new validation to take effect.
         *
         */
        clearValidators(): void;

        /**
         * Marks the control as `touched`. A control is touched by focus and
         * blur events that do not change the value.
         *
         * @see `markAsUntouched()`
         * @see `markAsDirty()`
         * @see `markAsPristine()`
         */
        markAsTouched(): void;
        /**
         * Marks the control and all its descendant controls as `touched`.
         * @see `markAsTouched()`
         */
        markAllAsTouched(): void;
        /**
         * Marks the control as `untouched`.
         *
         * If the control has any children, also marks all children as `untouched`
         * and recalculates the `touched` status of all parent controls.
         *
         * @see `markAsTouched()`
         * @see `markAsDirty()`
         * @see `markAsPristine()`
         */
        markAsUntouched(): void;

        /**
         * Marks the control as `dirty`. A control becomes dirty when
         * the control's value is changed through the UI; compare `markAsTouched`.
         *
         * @see `markAsTouched()`
         * @see `markAsUntouched()`
         * @see `markAsPristine()`
         */
        markAsDirty(): void;
        /**
         * Marks the control and all its descendant controls as `dirty`.
         * @see `markAsTouched()`
         */
        markAllAsDirty(): void;
        /**
         * Marks the control as `pristine`.
         *
         * If the control has any children, marks all children as `pristine`,
         * and recalculates the `pristine` status of all parent
         * controls.
         *
         * @see `markAsTouched()`
         * @see `markAsUntouched()`
         * @see `markAsDirty()`
         */
        markAsPristine(): void;

        /**
         * Subject for emitting  dirty / pristine state.
         *
         */
        readonly dirtySubject: Subject<boolean>;
        /**
         * Subject for emitting  touched / untouched state.
         *
         */
        readonly touchedSubject: Subject<boolean>;

        /**
         * Sets the synchronous validators that are active on this control.  Calling
         * this overwrites any existing sync validators.
         *
         * When you add or remove a validator at run time, you must call
         * `updateValueAndValidity()` for the new validation to take effect.
         *
         */
        setValidators(newValidator: ValidatorFn[] | null): void;

        /**
         * Gets the synchronous validators that are active on this control.
         *
         */
        getValidators(): ValidatorFn[] | null;

        protected _validators: ValidatorFn[] | null;

        /**
         * Recalculates the value and validation status of the form element.
         *
         * By default, it also updates the value and validity of its ancestors.
         */
        updateValidity(): void;

        protected _setInitialStatus;
        protected _existingValidationSubscription;
        validityPopper: PopperInstance;
        /**
         * Indicates whether validation errors are currently shown to the user.
         *
         */
        isValidityMessageShown$: Observable<boolean>;
        /**
         * Resets the element to original value and clear any of its errors.
         */
        reset(): void;
        /**
         * List of selected elements. Useful when selector has multiple results.
         */
        selectedFormControls: JQuery<FormControlType>[];
    }
}

declare namespace JQueryInternal {

    /**
     * Internal usage.
     */
    abstract class JQueryInternal<TElement = HTMLElement> extends JQuery<TElement> {
        /**
         * Set to true on form controls, otherwise undefined.
         */
        isFormControl: boolean;
        isFormGroup: boolean;
        value: any;
        valid: boolean | null;
        invalid: boolean | null;
        disabled: boolean;
        enabled: boolean;
        errors: ValidationErrors | null;
        pristine: boolean;
        dirty: boolean;
        touched: boolean;
        untouched: boolean;
        status: FormControlStatus;
        valueChanges: Observable<any>;
        valueChangesSubject: Subject<any>;
        statusChanges: Observable<FormControlStatus>;
        statusChangesSubject: Subject<FormControlStatus>;
        /**
         * Used to programatically update the validity of the form control.
         */
        manualValidityUpdateSubject: Subject<void>;
        dirtySubject: Subject<boolean>;
        touchedSubject: Subject<boolean>;
        _validators: ValidatorFn[] | null;
        public _setInitialStatus;
        public _existingValidationSubscription;
        selectedFormControls: JQueryInternal<FormControlType>[];
        selectedFormControlsSubject: BehaviorSubject<JQueryInternal<FormControlType>[]>;
        selectedFormControls$: Observable<JQueryInternal<FormControlType>[]>;
    }
}
