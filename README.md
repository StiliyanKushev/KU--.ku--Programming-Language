KU (.ku) Programming Language

## Todo List

-- inputs --
------------
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