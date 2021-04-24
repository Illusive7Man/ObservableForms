/**
 * Used for global configuration.
 */
import { observeShadowRoot, stopObservingShadowRoot } from "./controlObserver";
import {ValidatorFn} from "./types";
import {Placement} from "@popperjs/core";

export class ConfigService {

    /**
     * Observe changes in DOM, adding and removing of nodes,
     * to update lists of controls in initialized groups.
     *
     * Example: adding an input element in a subtree of a form group will add it to the group.
     */
    static useMutationObservers = true;

    /**
     * List of selectors that will make any new, or removed, html element that matches any of them be skipped over
     * in Mutation observer's scan for changes in controls.
     *
     * This is a performance config and it is not required in 99% of cases.
     */
    static excludedObserverElements: string[] = ['span.popper.validation'];


    static observeShadowRoot(shadowRoot: ShadowRoot): void  {
        observeShadowRoot(shadowRoot);
    }

    static stopObservingShadowRoot(shadowRoot: ShadowRoot): void {
        stopObservingShadowRoot(shadowRoot);
    }


    static registeredAttributeValidators: {[key: string]: ValidatorFn | ValidatorFn[]} = {};
    /**
     * Registers validator functions to use on an control that has the specified attribute. You could use this function multiple times, but it won't have an effect on existing form controls.
     * @param attributeValidators Object that has desired attribute names as keys, whose value are validator functions.
     */
    static registerAttributeValidators(attributeValidators: {[key: string]: ValidatorFn | ValidatorFn[]}): void {
        this.registeredAttributeValidators = {...this.registeredAttributeValidators, ...attributeValidators};
    }

    /**
     * Maps error codes to validation messages to display to user;
     *
     * Example:
     * ```typescript
     * validationErrors.required = 'The field is required';
     * ```
     */
    static validationErrors: {[key: string]: string} = {};

    /**
     * Determines default behavior of popper validation elements.
     */
    static popperConfig: {[key in 'defaultPosition' | 'fallbackPosition']: Placement} = {defaultPosition: 'left', fallbackPosition: 'top'}
}
