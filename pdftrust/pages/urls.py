from django.urls import path

from . import views

urlpatterns = [
    path('', views.index_view, name='index'),
    path('merge/', views.merge_view, name='merge'),
    path('split/', views.split_view, name='split'),
]