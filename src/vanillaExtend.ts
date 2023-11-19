import {Observable} from 'rxjs';
import {FormControl} from './formControl';
import {FormGroup} from './formGroup';
import {findCachedElement} from './common/cache';
import {AbstractControl} from './abstractControl';


export function extendVanillaElements() {
    let baseSetAttributeFn = HTMLElement.prototype.setAttribute;
    let baseRemoveAttributeFn = HTMLElement.prototype.removeAttribute;
    let baseValueGetFn = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').get;
    let baseValueSetFn = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;

    // NodeList
    (NodeList as any).prototype.asFormControl = function<TValue = string>(valueChangesUI?: Observable<any>, touchedUI$?: Observable<void>, dirtyUI$?: Observable<void>): FormControl<TValue> {
        return new FormControl<TValue>(this, valueChangesUI, touchedUI$, dirtyUI$);
    };
    (NodeList as any).prototype.asFormGroup = function<TControl = any>(valueChangesUI?: Observable<TControl>, touchedUI$?: Observable<void>, dirtyUI$?: Observable<void>): FormGroup<TControl> {
        return new FormGroup<TControl>(this, valueChangesUI, touchedUI$, dirtyUI$);
    };


    // HTMLElement
    HTMLElement.prototype.asFormControl = function<TValue = string>(valueChangesUI?: Observable<any>, touchedUI$?: Observable<void>, dirtyUI$?: Observable<void>): FormControl<TValue> {
        return new FormControl<TValue>(this, valueChangesUI, touchedUI$, dirtyUI$);
    };
    HTMLElement.prototype.asFormGroup = function<TControl = any>(valueChangesUI?: Observable<TControl>, touchedUI$?: Observable<void>, dirtyUI$?: Observable<void>): FormGroup<TControl> {
        return new FormGroup<TControl>(this, valueChangesUI, touchedUI$, dirtyUI$);
    };

    Object.defineProperty(HTMLInputElement.prototype, 'value', {
        get: function () {
            let cachedControl = findCachedElement(this);

            if (cachedControl == null)
                return baseValueGetFn.apply(this);

            if ((cachedControl as any).ignoreValueGetter) {
                return baseValueGetFn.apply(this);
            }

            return cachedControl.value;
        },
        set: function (newValue) {
            let cachedControl = findCachedElement(this);

            if (cachedControl == null)
                return baseValueSetFn.apply(this, [newValue]);

            baseValueSetFn.apply(this, [newValue]);
            (cachedControl as any).ignoreValueSetter = true;
            cachedControl.setValue(newValue);
            (cachedControl as any).ignoreValueSetter = false;

            return this;
        },
        configurable: true,
        enumerable: true
    });

    HTMLElement.prototype.setAttribute = function(qualifiedName: string, value: string): string | null {
        // Handle setting of disabled and type attributes
        if (qualifiedName !== 'disabled' && qualifiedName !== 'type')
            return baseSetAttributeFn.apply(this, arguments);

        // List of controls that either been applied disabled attribute to, or have changed their type to, or from, 'hidden'.
        let controlToUpdate: AbstractControl | null;

        let control = findCachedElement(this);
        if (control) {
            let currentType = control && ([...[control.source]].flat()[0] as HTMLInputElement).type;
            if (qualifiedName === 'disabled' || qualifiedName === 'type' && [currentType, value].some(e => e === 'hidden') && [currentType, value].some(e => e !== 'hidden'))
                controlToUpdate = control;
        }

        let result = baseSetAttributeFn.apply(this, arguments);
        if (controlToUpdate) {
            if (qualifiedName === 'disabled') {
                (controlToUpdate as any).disabledSubject.next(true);
            } else {
                (controlToUpdate as any).hiddenSubject.next(value === 'hidden')
            }
        }

        return result;
    }

    HTMLElement.prototype.removeAttribute = function(qualifiedName: string): void {
        let result = baseRemoveAttributeFn.apply(this, [qualifiedName]);

        if (qualifiedName !== 'disabled')
            return result;

        let control = findCachedElement(this);
        if (!control)
            return;

        (control as any).disabledSubject.next(false);

        return result;
    }

}