KU (.ku) Programming Language

## Todo List

-- string --
------------

@strcmp - takes two strings and compares them. returns true or false.
"str" == "str" - binary shorthand

-- inputs --
------------

@noecho - disables echo from stdin to stdout
@onecho - enables echo from stdin to stdout
@rkey - reads key from stdin, returns string
@rline - reads line from stdin, returns string

-- memory management --
-----------------------

@mmap - takes size/num, returns address/num on heap
@munmap - takes address/num and size/num, and free's memory

-- structs --
-------------

struct person {
    age num
    first_name str
    last_name str
    programmer bol
}

:my_person/person = {
    age = 10
    first_name = "Stiliyan"
    last_name = "Kushev"
    programmer = true
}

-- casting --
-------------

?num addr
?str addr
?bol addr
?custom_struct addr

-- parsing --
-------------

@num2str 
@str2num
...

-- decimals --
--------------

:my_var/dec = 1.1

-- pointers --
--------------

&my_str
&my_bol
&my_strcut
&my_number