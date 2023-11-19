import {AbstractControl} from "../abstractControl";
import {FormControl} from "../formControl";
import {Observable} from "rxjs";
import {FormGroup} from "../formGroup";

export type FormControlType = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export type ValidationErrors = {
    [key: string]: any;
};

export interface ValidatorFn<TControl = AbstractControl> {
    (formControl: TControl): ValidationErrors | null;
}

export enum FormControlStatus {
    VALID = 'VALID',
    INVALID = 'INVALID',
    PENDING = 'PENDING',
    DISABLED = 'DISABLED'
}



// ! works with enums also
type PrimitiveType = number | string | boolean | Date;

type PathImpl<T, Key extends keyof T> = Key extends string
    ? T[Key] extends FormControl | PrimitiveType ? Key                                                                                       // FormControl nodes represent custom controls, whose TValue properties cannot be accessed from ControlTree
    : T[Key] extends (infer U)[] ? U extends FormControl | PrimitiveType ? `${Key}[%d]` : `${Key}[%d].${PathImpl<U, keyof U>}` | `${Key}[%d]`// If not a primitive type, use a template string, where arrays have [$d] attached to the end.
    : `${Key}.${PathImpl<T[Key], Exclude<keyof T[Key], keyof any[]>>}` | `${Key}`                                                            // Parent.Child.<etc>
    : never;
// Note: Access to intermediary properties, such as "${Key}" from above,
// can be used by custom controls, that provide an entire value object instead of one primitive field

export type ControlTree<T> = {
    [K in keyof T]: T[K] extends FormControl<infer C> ? FormControl<C> : T[K] extends PrimitiveType ? FormControl : T[K] extends (infer U)[] ? U extends FormControl<infer C2> ? FormControl<C2>[] : U extends PrimitiveType ? FormControl[] : ControlTree<U>[]
        : ControlTree<T[K]>;
}
// Note: FormControl := FormControl<string> is used as default since the type of html field's value is always string.

/**
 * Type safe property access of typescript objects.
 */
export type ControlTreePath<T> = 0 extends (1 & T) ? string : T extends PrimitiveType ? never                           // Any or primitive
        : T extends (infer U)[] ? U extends PrimitiveType | FormControl ? '[%d]' : `[%d].${PathImpl<U, keyof U>}`       // Array
        : PathImpl<T, keyof T>;                                                                                         // Object
// Note 1: "0 extends (1 & T)" check for any type.


export type DeepPartial<T> = {
    [Key in keyof T]?: T[Key] extends Record<string, any>
        ? T[Key] extends (infer G)[]
            ? G extends Record<string, any> ? DeepPartial<G>[] : T[Key]
            : DeepPartial<T[Key]>
        : T[Key]
}


declare global {
    interface JQuery<TElement = HTMLElement> extends Iterable<TElement> {

        /**
         * Converts a jQuery object to a form control,
         * or returns the cached version if the same element is already being used as a control.
         * Form control has properties for:
         *  - observing values, {@link JQuery.valueChanges}
         *  - checking whether user's changed the value, {@link JQuery.dirty}
         *  - checking whether user's interacted any way with the control, {@link JQuery.touched}
         * @param valueChangesUI Observable to use for observing values, instead of the default `valueChanges`. Note: `val(value)` will also make it emit values.
         * @param touchedUI$ Sets `touched = true` every time it emits.
         * @param dirtyUI$ Sets `dirty = true` every time it emits.
         */
        asFormControl<TValue = string>(valueChangesUI?: Observable<TValue>, touchedUI$?: Observable<void>, dirtyUI$?: Observable<void>): FormControl<TValue>;

        /**
         * Converts a jQuery object to a form group,
         * or returns the cached version if the same selection of elements is already being used as a group.
         * Form groups' descendants which are form controls, are added to the {@link JQuery.controls} array,
         * and group and its controls have been attached with the properties for:
         *  - observing values, {@link JQuery.valueChanges}
         *  - checking whether user's changed the value, {@link JQuery.dirty}
         *  - checking whether user's interacted any way with the control, {@link JQuery.touched}
         * @param valueChangesUI Observable to use for observing values, instead of the default `valueChanges`. Note: `val(value)` will also make it emit values.
         * @param touchedUI$ Sets `touched = true` every time it emits.
         * @param dirtyUI$ Sets `dirty = true` every time it emits.
         */
        asFormGroup<TControls = any>(valueChangesUI?: Observable<any>, touchedUI$?: Observable<void>, dirtyUI$?: Observable<void>): FormGroup<TControls>;
    }

    interface HTMLElement {

        /**
         * Converts a jQuery object to a form control,
         * or returns the cached version if the same element is already being used as a control.
         * Form control has properties for:
         *  - observing values, {@link JQuery.valueChanges}
         *  - checking whether user's changed the value, {@link JQuery.dirty}
         *  - checking whether user's interacted any way with the control, {@link JQuery.touched}
         * @param valueChangesUI Observable to use for observing values, instead of the default `valueChanges`. Note: `val(value)` will also make it emit values.
         * @param touchedUI$ Sets `touched = true` every time it emits.
         * @param dirtyUI$ Sets `dirty = true` every time it emits.
         */
        asFormControl<TValue = string>(valueChangesUI?: Observable<TValue>, touchedUI$?: Observable<void>, dirtyUI$?: Observable<void>): FormControl<TValue>;

        /**
         * Converts a jQuery object to a form group,
         * or returns the cached version if the same selection of elements is already being used as a group.
         * Form groups' descendants which are form controls, are added to the {@link JQuery.controls} array,
         * and group and its controls have been attached with the properties for:
         *  - observing values, {@link JQuery.valueChanges}
         *  - checking whether user's changed the value, {@link JQuery.dirty}
         *  - checking whether user's interacted any way with the control, {@link JQuery.touched}
         * @param valueChangesUI Observable to use for observing values, instead of the default `valueChanges`. Note: `val(value)` will also make it emit values.
         * @param touchedUI$ Sets `touched = true` every time it emits.
         * @param dirtyUI$ Sets `dirty = true` every time it emits.
         */
        asFormGroup<TControls = any>(valueChangesUI?: Observable<any>, touchedUI$?: Observable<void>, dirtyUI$?: Observable<void>): FormGroup<TControls>;
    }

    interface NodeListOf<TNode extends Node> extends NodeList {
        /**
         * Converts a jQuery object to a form control,
         * or returns the cached version if the same element is already being used as a control.
         * Form control has properties for:
         *  - observing values, {@link JQuery.valueChanges}
         *  - checking whether user's changed the value, {@link JQuery.dirty}
         *  - checking whether user's interacted any way with the control, {@link JQuery.touched}
         * @param valueChangesUI Observable to use for observing values, instead of the default `valueChanges`. Note: `val(value)` will also make it emit values.
         * @param touchedUI$ Sets `touched = true` every time it emits.
         * @param dirtyUI$ Sets `dirty = true` every time it emits.
         */
        asFormControl<TValue = string>(valueChangesUI?: Observable<TValue>, touchedUI$?: Observable<void>, dirtyUI$?: Observable<void>): FormControl<TValue>;

        /**
         * Converts a jQuery object to a form group,
         * or returns the cached version if the same selection of elements is already being used as a group.
         * Form groups' descendants which are form controls, are added to the {@link JQuery.controls} array,
         * and group and its controls have been attached with the properties for:
         *  - observing values, {@link JQuery.valueChanges}
         *  - checking whether user's changed the value, {@link JQuery.dirty}
         *  - checking whether user's interacted any way with the control, {@link JQuery.touched}
         * @param valueChangesUI Observable to use for observing values, instead of the default `valueChanges`. Note: `val(value)` will also make it emit values.
         * @param touchedUI$ Sets `touched = true` every time it emits.
         * @param dirtyUI$ Sets `dirty = true` every time it emits.
         */
        asFormGroup<TControls = any>(valueChangesUI?: Observable<any>, touchedUI$?: Observable<void>, dirtyUI$?: Observable<void>): FormGroup<TControls>;
    }
}