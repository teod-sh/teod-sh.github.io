---
slug: python-descriptors
title: Beyond @property - Unleashing the Power of Python Descriptors
date: 2025-06-17T21:55:21.800Z
excerpt: Python descriptors and its usability
coverImage: /images/posts/project-structure.jpg
tags:
  - Python
---


<script>
  import CodeBlock from "$lib/components/molecules/CodeBlock.svelte";
</script>

There are many ways to deal with object access out there, you could follow C++, C# for example that normally uses getters and setters, or even in a more pythonic way using @property + @property.setters decorators but today we will work with Python descriptors.

### What is Python Descriptors?

Descriptors works like a wrapper around a property, in the high level this will act like getters and setters, wrapping the access of a property, allowing access control, data validation, logging or anything you want to do as you would in a normal python function.
Ok, this until now doesnt seems to be too nice to use if this at the end is basically a function, isnt? Actually the possibilities with descriptors are I would say infinity but let's dive into an example to get a better view of it.

Before continue, please take a look at this requirements:

- Previous Python Knowledge
- Python 3.10+

Lets define the Descriptor:

<CodeBlock lang="python" filename="sample.py">

```py
class DescriptorClass:

    def __init__(self, attr_validator = None, attr_access_control = None):
        self.attr_validator = attr_validator
        self.attr_access_control = attr_access_control
        self.attr_name = None

    def __set_name__(self, owner, name):
        # This function is called when the instance of the descriptor is created in your class
        # when this happens python will call it so we can map the name of the attribute we have to deal
        # or the owner of it if you want, that is the class you have used the descriptor
        self.attr_name = f'_{name}'

    def __get__(self, obj, objtype=None):
        # obj here is the instance that have the descriptor
        # objtype is the class type of the obj
        if self.attr_access_control and self.attr_access_control(obj) is False:
            print("not allowed to access value")
            return

        if obj is None:
            # return self here allows us to dynamically access the meta values from descriport comming from the class that is using it
            # E.g YourClass.your_descriptor_attr.attr_validator | ...attr_access_control and etc...
            # in other words: allow metadata access when accessed from the class rather than an instance
            return self

        return getattr(obj, self.attr_name)
    
    def __set__(self, obj, value):
        # obj here is the same as in __get__
        # value is the value you are trying to set
        if self.attr_access_control and self.attr_access_control(obj) is False:
            print("not allowed to change value")
            return
        
        if self.attr_validator:
            self.attr_validator(value)
        setattr(obj, self.attr_name, value)
```

</CodeBlock>

Now, we will need a few dummy validators to use in our example

<CodeBlock lang="python" filename="sample.py">

```py
def number_validator(value):
    if not isinstance(value, int):
        raise ValueError("Value must be an integer")
    if value < 0:
        raise ValueError("Value must be a positive integer")

def string_validator(value):
    if not isinstance(value, str):
        raise ValueError("Value must be an string")

    if len(value) < 2 or len(value) > 10:
        raise ValueError("Value must lenght between 2 and 10")

def refuse_access_if_admin_flag_is_not_set(obj):
    if hasattr(obj, "admin_flag"):
        return getattr(obj, "admin_flag") == True
    
    return False
```

</CodeBlock>

And last, a class to play around

<CodeBlock lang="python" filename="sample.py">

```py
class YourClass:

    my_number = DescriptorClass(number_validator)
    my_string = DescriptorClass(string_validator, refuse_access_if_admin_flag_is_not_set)

    def __init__(self, num, string):
        self.my_number = num
        self.admin_flag = True
        self.my_string = string
```

</CodeBlock>

With all this sample code in place I think i give a better idea of the power of Descriptors, its easy to visualize that the extension of this validadors to make something else is completly possible. 
E.g you could log a specific string pattern when some value is changed, or even are close to some boundaries and you want to track this using some alert system or whatever you have in place to watch the values you want…


Playing around:
<CodeBlock lang="python" filename="terminal">

```py
>>> from main import YourClass
>>> obj = YourClass(2, "nice value")
>>> obj.my_number
2
>>> obj.my_string
'nice value'
>>> obj.admin_flag
True
>>> obj.admin_flag =  False
>>> obj.my_string
not allowed to access value
>>> obj.my_string = "random value"
not allowed to change value
>>> obj.admin_flag = True
>>> obj.my_string = "cc"
>>> obj.my_string = "c"
Traceback (most recent call last):
  ...
ValueError: Value must lenght between 2 and 10
>>> obj.my_string = "ccccc"
>>> obj.my_string = "cccccccccccccc"
Traceback (most recent call last):
  ...
ValueError: Value must lenght between 2 and 10
>>> obj.my_number = "hi"
Traceback (most recent call last):
  ...
ValueError: Value must be an integer
>>> obj.my_number = -1
Traceback (most recent call last):
  ...
ValueError: Value must be a positive integer
>>> obj.my_number = 5
>>> obj.my_number
5
>>> obj.my_string
'ccccc'
```

</CodeBlock>

### Conclusion
Descriptors is a powerful tool as you all can see, it could allow you to extend your code functionality while keeping it safe to use and easy to understand. It's important to note that while I said before when starting to explain what Descriptors are, comparing with property decorator and etc…, 
!!! in fact I would love to enforce here that Descriptors are not an alternative to @property - it's way more powerful than that and also just so you know, @property is built using Descriptors as are @classmethod and @staticmethod. 


Thank you for reading! I hope you learned a little bit. If you have any complaint or want to talk please, drop me a message on linkedin!