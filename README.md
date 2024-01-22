<div><img align="left" src="https://i.imgur.com/1rgGsIA.png" alt="Observable logo" width="200"/>


# &nbsp;&nbsp;Observable Forms [![npm version](https://badge.fury.io/js/observable-forms.svg)](http://badge.fury.io/js/observable-forms)
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Framework-agnostic port of Angular's Reactive forms.
</div>
<br/><br/><br/><br/>

### Version 2
Removed jQuery dependency. Added support for native HTMLElement and NodeList.
<br/>

## Introduction

A client-side library for creating an observable object from HTML form elements. As an observable object, it will have built-in reactivity
so the library is framework-agnostic and compatible with any ecosystem. It can be used with MVC, SPA, SSR, etc., frameworks.
Reactivity is RxJS based and its API is inspired by what Angular has used for forms since Angular 2.

<figure>
<img src="https://i.imgur.com/ahYEZba.jpeg" alt="code example">
  <figcaption>Demo usage</figcaption>
</figure>

<a name="functionality"/>

## Functionality & Usage

### Form Control
This is one of the two fundamental building blocks of Observable Forms, along with
`FormGroup`. It tracks the value and validation status of an individual form control
(a single text input, a set of radio inputs with the same name, etc.).

Example of creating and using a form control:

```typescript
// Module imports
import ...

// Example 1: logging FormControl values
let firstName = document.getElementById('firstName').asFormControl().enableValidation();
firstName.valueChanges.subscribe(value => console.log('My new value is: ' + value));

// Example 2: Complex directing between different controls
// Using delivery and payment controls
let deliveryAddress = document.getElementById('delivery-address').asFormControl();
let paymentAddress = document.getElementById('payment-address').asFormControl().enableValidation();

// Check if they should be the same 
let areAddressesDifferent$ = document.getElementById('different-checkbox').asFormControl().valueChanges
    .pipe(map(value => value === 'true'), startWith(false));

// And either validate payment address if different, or use value of delivery address
areAddressesDifferent$.pipe(switchMap(value => value
    ? paymentAddress.statusChanges.pipe(tap(status => status === FormControlStatus.INVALID && alert('Entered address is not valid')))
    : deliveryAddress.valueChanges.pipe(tap(value => paymentAddress.setValue(value)))
)).subscribe();
```
<br/>

### Form Group
Form group aggregates controls found in the subtree of the selected element(s) into one object,
with each control's name as the key. Name is either control's `name` attribute or one manually provided.<br/>
Class of this object accepts a **type parameter** representing the model of the form group,
which provides static type checking when working with the controls and values.<br/>
<ins>Type checking is also available in plain JavaScript no-build projects using JSDoc (demo available).</ins><br/><br/>


Some features of the FormGroup objects are:
- The value is a JSON object of child controls' names and values.
- Controls can be added and removed from the group.
- Validation
- Custom controls as child controls
- Simple abstraction for radio and checkbox controls
- Web Components support


```typescript
class MyForm {
    fullName: string;
    isSubscriber: boolean;
    addresses: {street: string; city: string}[];
}

// Create a form group (TS version)
let form = document.querySelector('form').asFormGroup<MyForm>();

// Accessing child controls and value, with editor providing type information
form.controls.fullName.valueChanges.subscribe(_ => '...')
form.controls.addresses[0].city.valueChanges.subscribe(_ => '...');
console.log(form.value.isSubscriber);
```
<img src="https://i.imgur.com/P1wCcPU.png" alt="Autocomplete in action" width="100%"/>
<div align="center">Autocomplete in action</div>
<br/><br/>

Some of the properties, observables and methods of `FormControl` and `FormGroup` are:
- value, valueChanges&nbsp;&emsp; - _string or JSON_
- status, statusChanges&emsp;- _valid, invalid or disabled_
- touched&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;- _has the user interacted with the element(s) at all_
- dirty&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&nbsp; - _has the user changed element(s) value_
- setValue()
- reset()


Despite some inconsistencies, Angular docs can be used as more detailed API reference:
[AbstractControl](https://angular.io/api/forms/AbstractControl), [FormControl](https://angular.io/api/forms/FormControl),
[FormGroup](https://angular.io/api/forms/FormGroup).


<a name="demos"/>

## Demos
These demos will try to cover as many scenarios as possible, such as:
- disabling / enabling form controls
- adding / removing controls from the DOM
- changing element's types
- creating controls from non-input elements
- handling [Web Components](https://developer.mozilla.org/en-US/docs/Web/Web_Components)
- changing form's data / resetting
- handling arrays

### Demo 1 - "A standard form"
A JavaScript project covering a lot of library's functionalities, and showing how to integrate type checking into JavaScript code.<br/>
[Demo 1](https://b1h75.csb.app/)

_Note: that CodeSandbox has some built-in js bundler that allows non-standard imports in .js files.
Below those imports are comments on how they should be used plain .js files._
<br/><br/>
### Demo 2 - "Custom made"
A TypeScript project covering custom form controls. Also demonstrates support for Web Components.<br/>
[Demo 2](https://dxrdg.csb.app/)
<br/><br/>

### Demo 3 - "Form update"
A JavaScript project showing how to change form's data and how to reset it.<br/>
[Demo 3](https://rysti.csb.app/)
<br/><br/>
<a name="installation"/>

## Installation
### ES6 via npm
`npm i observable-forms` <br/><br/>
Inside a html script tag, or in javascript:
```html
<script type="module">
    import {} from "./node_modules/observable-forms/dist/index.js";
    // Library self initializes when module is loaded.

    let formControl = document.querySelector('input').asFormControl().valueChanges.subscribe(val => console.log(val));
    ...
</script>
```

or, in Typescript:
```javascript
import {ConfigService, Validators} from "observable-forms";

// Declaratively adding validation to controls using html attributes
ConfigService.registerAttributeValidators({
    'data-val-required': Validators.required,
    'data-val-email': Validators.email,
    'data-val-url': c => c.value === '' || URL_REGEXP.test(c.value) ? null : {url: true}
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


