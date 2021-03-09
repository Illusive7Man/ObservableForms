# Observable Forms plug-in for jQuery [![npm version](https://badge.fury.io/js/observable-forms.svg)](http://badge.fury.io/js/observable-forms)
Inspired by Angular's forms.
<br/>
<br/>




With this library, you can create an interactive representation of your html form,
whose API is based on reactive patterns.<br/>
Instead of manually selecting and attaching the JavaScript code to form's elements,
more direct, explicit access to elements' functionalities is provided through objects called `FormControl` and `FormGroup`.<br/>

##### Prerequisites:
- Basic knowledge of RxJS is desirable.<br/>

##### Table of Contents
[Functionality](#functionality)<br/>
[Usage](#usage)<br/>
[Demos](#demos)<br/>
[Installation](#installation)<br/>

<a name="functionality"/>

## Functionality
A `FormControl` represents a single form element, e.g. a single text input, or a set of radio inputs with the same name,
and a `FormGroup` represents a collection of those controls, e.g. a form.<br/>
Some of the properties representing the referenced element(s) are:
- value
- touched&emsp;- _has the user interacted with the element(s) at all_
- dirty&emsp;&emsp;&nbsp; - _has the user changed element(s) value_
- valid
- disabled

Also, methods to change these properties are provided, along with the observable streams, such as `valueChanges` and `statusChanges`
that track the value and status (valid, invalid or disabled) of the element(s).<br/>
These properties and methods were designed to replace the usual handling of events and changing of attributes 
when working with a form, and make the implementation of form validation
and custom form logic as straightforward as possible.

<a name="usage"/>

## Usage
Creating and using a form control is pretty simple:

```typescript
import {switchMap, tap} from "rxjs/operators";
import {FormControlStatus} from "./types";

let firstName = $('#firstName').asFormControl().enableValidation();
firstName.valueChanges.subscribe(value => console.log('My new value is: ' + value));

// ...
// Let's try something a bit more complicated

let deliveryAddress = $('#delivery-address').asFormControl();
let paymentAddress = $('#payment-address').asFormControl().enableValidation();

let isPaymentDifferentFromDelivery$ = $('#different-checkbox').asFormControl().valueChanges
    .pipe(map(value => value.toLowerCase() === 'true'), startWith('false'));

isPaymentDifferentFromDelivery$.pipe(switchMap(isDifferent => isDifferent
    ? paymentAddress.statusChanges.pipe(tap(status => 
        status === FormControlStatus.INVALID ? alert('Entered address is not valid') : null))
    : deliveryAddress.valueChanges.pipe(value => paymentAddress.setValue(value))
)).subscribe();
```
<br/><br/>
Form group aggregates controls found in the subtree of the selected element(s) into one object,
with each control's name as the key. Name is either control's `name` attribute or one manually provided.<br/>
Class of this object accepts a type parameter representing the model of the form group,
which provides type checking when working with the controls.<br/><br/>
_Author's note: The best way to have full stack type checking is to find a tool
that will generate TypeScript versions of your backend classes, and use those as type parameters of form groups._


Some features of the FormGroup objects are:
- The value is a JSON object of selected controls and their values.
- Its validity is affected by the validity of the controls.
- Controls can be added and removed from the group.

```typescript
class MyForm {
    fullName: string;
    isSubscriber: boolean;
    addresses: {street: string; city: string}[];
}

// Type checking !!
let form = $('form').asFormGroup<MyForm>();
form.controls.fullName.valueChanges.subscribe(_ => '...')
form.controls.addresses[0].city.valueChanges.subscribe(_ => '...');
console.log(form.value.isSubscriber);
```

Descriptions of properties and methods of FormControl and FormGroup can be found at the [codesandbox link](https://codesandbox.io/s/declarations-gqjol).


_Important note: Type checking is available in both JavaScript and TypeScript projects._


<a name="demos"/>

## Demos
These demos will try to cover as many possible scenarios as possible, such as:
- changing element's types
- disabling/enabling form controls
- removing controls from the DOM
- adding new controls to the DOM
- handling [Web Components](https://developer.mozilla.org/en-US/docs/Web/Web_Components)
- changing form's data / resetting
- handling arrays

_Note: These demos are hosted on codesandbox, and code behind the forms can be accessed using the "Open Sandbox" button.
Fullscreen view is preferable, considering the style of validation messages.
Styling will be configurable in the future versions._<br/>
 
### Demo 1 - "A standard form"
A JavaScript project covering a lot of library's functionalities, and shows how to integrate type checking into JavaScript code.<br/>
[Demo 1](https://b1h75.csb.app/)

_Note: that CodeSandbox has some built-in js bundler that allows non-standard imports in .js files.
Below those imports are comments on how they should be used plain .js files._<br/>
<br/>
### Demo 2 - "Custom made"
A TypeScript project covering custom form controls. Also demonstrates support for Web Components.<br/>
[Demo2](https://dxrdg.csb.app/)


<a name="installation"/>

## Installation
### ES6 via npm
`npm i observable-forms` <br/><br/>
Inside a html script tag, or in javascript:
```html
<script type="module">
import {} from "./node_modules/observable-forms/dist/index.js";
// Library self initializes when module is loaded.

let $formControl = $('input').valueChanges.subscribe(val => console.log(val));
...
</script>
```

or, in Typescript:
```javascript
import {ConfigService, Validators} from "observable-forms";

ConfigService.registerAttributeValidators({
    'data-val-required': Validators.required,
    'data-val-email': Validators.email,
    'data-val-url': $e => $e.val() === '' || URL_REGEXP.test($e.val()) ? null : {url: true}
});
```
### CDN
For CDN, you can use [unpkg](https://unpkg.com/): <br/>
https://unpkg.com/observable-forms/dist/index.js

```html
<script type="module">
import {} from "https://unpkg.com/observable-forms/dist/index.js";
...
</script>
```


