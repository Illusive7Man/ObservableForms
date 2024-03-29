import {Observable} from "rxjs";
import {findCachedElement} from "./common/cache";
import {AbstractControl} from "./abstractControl";
import {FormControl} from "./formControl";
import {FormGroup} from "./formGroup";

export function extendJQueryElements(): void {
    let baseAttrFn = jQuery.fn.attr;
    let baseRemoveAttr = jQuery.fn.removeAttr;
    let baseValFn = jQuery.fn.val;

    jQuery.fn.extend({
        asFormControl<TValue = string>(valueChangesUI?: Observable<any>, touchedUI$?: Observable<void>, dirtyUI$?: Observable<void>): FormControl<TValue> {
            return new FormControl<TValue>(this.length === 1 ? [...this][0] : [...this], valueChangesUI, touchedUI$, dirtyUI$);
        },
        asFormGroup<TControl = any>(valueChangesUI?: Observable<TControl>, touchedUI$?: Observable<void>, dirtyUI$?: Observable<void>): FormGroup<TControl> {
            return new FormGroup<TControl>(this.length === 1 ? [...this][0] : [...this], valueChangesUI, touchedUI$, dirtyUI$);
        },
        val(value: any): any {

            // functions not yet supported
            if (value instanceof Function)
                return baseValFn.apply(this, arguments);

            let cachedControl = findCachedElement(this as HTMLElement);

            if (cachedControl == null)
                return baseValFn.apply(this, arguments);

            // Get or set
            if (value === undefined)
                return cachedControl.value;
            else {
                // Form controls and groups use a custom update logic
                cachedControl.setValue(value);

                return this;
            }
        },
        attr(attributeName: string, value: any): JQuery<HTMLElement> {

            // Handle setting of disabled and type attributes
            if (attributeName !== 'disabled' && attributeName !== 'type' || value === undefined)
                return baseAttrFn.apply(this, arguments);

            if (value instanceof Function)
                return baseAttrFn.apply(this, arguments);

            // List of controls that either been applied disabled attribute to, or have changed their type to, or from, 'hidden'.
            let controlsToUpdate: AbstractControl[] = [];

            this.each(function() {
                let control = findCachedElement(this as HTMLElement);
                if (control) {
                    let currentType = control && ([...[control.source]].flat()[0] as HTMLInputElement).type;
                    if (attributeName === 'disabled' || attributeName === 'type' && [currentType, value].some(e => e === 'hidden') && [currentType, value].some(e => e !== 'hidden'))
                        controlsToUpdate.push(control);
                }

            });

            let result = baseAttrFn.apply(this, arguments);
            controlsToUpdate.forEach(control => attributeName === 'disabled' ? !!value ? control.disable() : control.enable() : (control as any).hiddenSubject.next(value === 'hidden'));

            return result;
        },
        removeAttr(attributeName: string): JQuery<HTMLElement> {
            let result = baseRemoveAttr.apply(this, arguments);

            if (attributeName !== 'disabled')
                return result;

            this.each(function () {
                let control = findCachedElement(this as HTMLElement);
                if (!control)
                    return;

                (control as any).disabledSubject.next(false);
            });

            return result;
        }
    });
}
