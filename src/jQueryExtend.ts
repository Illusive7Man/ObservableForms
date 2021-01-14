import {combineControls, findFormControls, FormControlStatus, isValidFormControl} from "./common/misc";
import {disableValidation, enableValidation, getValidators, hasError, setValidators, updateValidity} from "./validation/validation";
import {Observable} from "rxjs";
import {asFormControl, asFormGroup, destroyControl, destroyGroup, overriddenConstructor} from "./input";
import {JQueryInternal} from "../@types/input";
import {cachedControlsAndGroups, findCachedElement, removeFromCache} from "./common/cache";
import {ConfigService} from "./common/config";

export function extendFormElements(): void {
    let baseAttrFn = jQuery.fn.attr;
    let baseRemoveAttr = jQuery.fn.removeAttr;
    let baseValFn = jQuery.fn.val;

    jQuery.fn.extend({
        val(value: any): any {

            // Gets the value
            if (value === undefined) {
                if (this.isFormGroup || this.isFormControl)
                    return this.value;

                return baseValFn.apply(this, arguments);
            }

            // Sets the value (functions not yet supported)
            if (!(value instanceof Function)) {
                let result = baseValFn.apply(this, arguments);

                if (this.isFormControl || this.isFormGroup)
                    this.valueChangesSubject.next(value as string);
                else if (this.length === 1 && isValidFormControl(this[0])) {
                    let cachedFormControl = findCachedElement(this);
                    if (cachedFormControl)
                        cachedFormControl.valueChangesSubject.next(value as string);
                }

                return result;
            }

            // If its sets a function, return default
            return baseValFn.apply(this, arguments);
        },
        attr(attributeName: string, value: any): JQuery<HTMLElement> {

            let result = baseAttrFn.apply(this, arguments);;

            // Handle setting of disabled and type attributes
            if (attributeName !== 'disabled' && attributeName !== 'type' || value === undefined)
                return result;

            this.each(function () {
                if (value instanceof Function)
                    return;

                let control: JQueryInternal.JQueryInternal<FormControlType> = this.isFormControl || this.isFormGroup ? this : findCachedElement(this);
                if (!control)
                    return;

                if (attributeName === 'disabled')
                    control.disabledSubject.next(value != null);

                else if (attributeName === 'type' && [control[0].type, value].some(e => e === 'hidden') && [control[0].type, value].some(e => e !== 'hidden'))
                    control.updateValidity();

            });

            return result;
        },
        removeAttr(attributeName: string): JQuery<HTMLElement> {
            let result = baseRemoveAttr.apply(this, arguments);

            if (attributeName !== 'disabled')
                return result;

            this.each(function () {
                let control: JQueryInternal.JQueryInternal<FormControlType> = this.isFormControl || this.isFormGroup ? this : findCachedElement(this);
                if (!control)
                    return;

                control.disabledSubject.next(false);
            });

            return result;
        },
        markAsTouched(): void {
            this.touched = true;
            this.touchedSubject.next(true);
        },
        markAllAsTouched(): void {
            this.touched = true;
            this.touchedSubject.next(true);

            this.controls?.forEach($d => $d.markAsTouched());
        },
        markAsUntouched(): void {
            this.untouched = true;
            this.touchedSubject.next(false);

            this.controls?.forEach($d => {
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

            this.controls?.forEach($d => $d.markAsDirty());
        },
        markAsPristine(): void {
            this.pristine = true;
            this.dirtySubject?.next(false);

            this.controls?.forEach($d => {
                $d.pristine = true;
                $d?.dirtySubject?.next(false);
            })
        },
        enableValidation(): JQuery<FormControlType | HTMLFormElement> {
            return enableValidation(this);
        },
        disableValidation(): JQuery<FormControlType | HTMLFormElement> {
            return disableValidation(this);
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

            this.controls.forEach($c => {
                $c.markAsUntouched();
                $c.markAsPristine();
                $c.val('');
            })
        },
        logErrors(): void {
            if (this.errors)
                console.log(this.errors);

            this.controls.forEach($c => $c.errors != null && console.log($c, $c.errors))
        },
        asFormControl(name?: string, valueChangesUI?: Observable<any>, touchedUI$?: Observable<void>, dirtyUI$?: Observable<void>): JQuery<FormControlType> {
            return asFormControl(this, name, valueChangesUI, touchedUI$, dirtyUI$);
        },
        asFormGroup(valueChangesUI?: Observable<any>, touchedUI$?: Observable<void>, dirtyUI$?: Observable<void>): JQuery<FormControlType | HTMLFormElement> {
            return asFormGroup(this, valueChangesUI, touchedUI$, dirtyUI$);
        },
        valueMap(mapFn: (value: any) => any): JQuery<FormControlType | HTMLFormElement> {
            this.valueMapFn = mapFn;
            return this;
        },
        destroyControl(): void {
            return destroyControl(this);
        },
        destroyGroup(): void {
            return destroyGroup(this);
        }
    });


    /*===== Constructor =====*/
    (jQuery.fn as any).init = overriddenConstructor;


    $(_ => {

        /**
         * Used for updating list of existing controls, disposing the removed ones,
         * and updating the list of controls selected by a group.
         */
        let controlRemovalObserver = new MutationObserver(entries => {

            if (ConfigService.useMutationObservers === false)
                return;

            /*** Form controls, from removed nodes, are removed from cache and groups  ***/

            let removedHtmlElements = (<HTMLElement[]>entries.flatMap(entry => [...entry.removedNodes]
                .filter(node => node instanceof HTMLElement)
                .filter((element: HTMLElement) => ConfigService.excludedObserverElements.every(selector => !element.matches(selector)))));

            let removedControls = removedHtmlElements.flatMap(e => findFormControls(e, true));

            // Remove empty controls
            if (removedControls.length > 0) {

                let cachedControlsToRemove: JQueryInternal.JQueryInternal<HTMLElement>[] = [];

                for (let cachedElement of cachedControlsAndGroups) {
                    if (cachedElement.isFormControl && removedControls.includes(cachedElement[0]))
                        cachedControlsToRemove.push(cachedElement);

                    else if (cachedElement.isFormGroup && cachedElement.controls.some($e => removedControls.includes($e[0])))
                        cachedElement.controls = cachedElement.controls.filter($e => !removedControls.includes($e[0]));

                }

                // Expunge added properties and methods
                cachedControlsToRemove.forEach(element => element.destroyControl());
            }


            /*** Form controls, from added nodes, are added to groups that have selected those nodes or their parents ***/

            let addedHtmlElements = (<HTMLElement[]>entries.flatMap(entry => [...entry.addedNodes]
                .filter(node => node instanceof HTMLElement)
                .filter((element: HTMLElement) => ConfigService.excludedObserverElements.every(selector => !element.matches(selector)))));

            let addedControlsInElements = addedHtmlElements.map(element => ({element, controls: findFormControls(element)})).filter(_ => _.controls.length > 0);

            if (addedControlsInElements.length > 0) {
                let cachedGroupsWithNonControlSelectors = cachedControlsAndGroups
                    .filter(element => element.isFormGroup)
                    .map(element => ({element, nonControls: [...element].filter(e => !isValidFormControl(e))}))
                    .filter(_ => _.nonControls.length > 0);

                for (let cachedGroup of cachedGroupsWithNonControlSelectors) {

                    let addedToGroup = addedControlsInElements
                        .filter(addedControlsInElement => cachedGroup.nonControls.some(nonControl => nonControl.contains(addedControlsInElement.element)))
                        .flatMap(addedControls => addedControls.controls);

                    if (addedToGroup.length === 0)
                        continue;

                    // Function returns false if controls belong to the same control
                    let controls = combineControls(addedToGroup.map(e => e as FormControlType)) || [$(addedToGroup) as JQueryInternal.JQueryInternal<FormControlType>];

                    cachedGroup.element.controls = [...cachedGroup.element.controls, ...controls]
                }
            }

        });

        controlRemovalObserver.observe(document.body, {childList: true, subtree: true});
    });
}
